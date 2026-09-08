package com.ddarungflow.admin.operations;

import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.inventory.CurrentInventoryEligibility;
import com.ddarungflow.inventory.InventoryStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

@Service
public class AdminOpsGlobalRiskGenerationService {
    static final int CHUNK_SIZE = 20;
    static final int MAX_CALLS = 250;
    static final int MAX_STATIONS = CHUNK_SIZE * MAX_CALLS;
    private static final List<Integer> HORIZONS = List.of(60, 120, 180, 240);
    private static final List<Integer> QUANTITIES = List.of(1, 2, 3, 4, 5);

    private final AdminOpsReadRepository readRepository;
    private final AdminOpsGlobalRiskRepository globalRepository;
    private final InferenceClient inferenceClient;
    private final AtomicInteger activeMapEvaluations = new AtomicInteger();
    private final Sleeper sleeper;
    private final LongSupplier nanoTime;
    private final long retryBackoffMs;
    private final long maxWallClockMs;
    private final long leaseMs;

    @org.springframework.beans.factory.annotation.Autowired
    public AdminOpsGlobalRiskGenerationService(AdminOpsReadRepository readRepository,
                                               AdminOpsGlobalRiskRepository globalRepository,
                                               InferenceClient inferenceClient,
                                               @Value("${admin.ops.global-risk.retry-backoff-ms:2000}") long retryBackoffMs,
                                               @Value("${admin.ops.global-risk.max-wall-clock-ms:900000}") long maxWallClockMs,
                                               @Value("${admin.ops.global-risk.lease-ms:1200000}") long leaseMs) {
        this(readRepository, globalRepository, inferenceClient, retryBackoffMs, Math.min(maxWallClockMs, 900_000L), leaseMs,
                Thread::sleep, System::nanoTime);
    }

    AdminOpsGlobalRiskGenerationService(AdminOpsReadRepository readRepository, AdminOpsGlobalRiskRepository globalRepository,
                                        InferenceClient inferenceClient,
                                        long retryBackoffMs, long maxWallClockMs, long leaseMs,
                                        Sleeper sleeper, LongSupplier nanoTime) {
        this.readRepository = readRepository;
        this.globalRepository = globalRepository;
        this.inferenceClient = inferenceClient;
        this.retryBackoffMs = retryBackoffMs;
        this.maxWallClockMs = maxWallClockMs;
        this.leaseMs = leaseMs;
        this.sleeper = sleeper;
        this.nanoTime = nanoTime;
    }

    public Outcome generate() {
        if (isMapActive()) return new Outcome("SKIPPED", "MAP_ACTIVE", 0, null);
        UUID owner = UUID.randomUUID();
        AdminOpsGlobalRiskRepository.LeaseAcquisition lease = globalRepository.acquireLease(owner, leaseMs);
        OffsetDateTime startedAt = lease.startedAt();
        if (!lease.acquired()) {
            return new Outcome("SKIPPED", "LEASE_HELD", 0, null);
        }
        long startedNanos = nanoTime.getAsLong();
        Budget budget = new Budget(startedNanos);
        try {
            guard(owner, startedAt, budget);
            List<AdminOpsReadRepository.Row> rows = readRepository.findRows(null, null, null, null);
            List<StationEvaluation> stations = rows.stream().map(row -> station(row, startedAt)).toList();
            List<StationEvaluation> eligible = stations.stream().filter(value -> "NORMAL".equals(value.dataState())).toList();
            if (eligible.size() > MAX_STATIONS) throw new GenerationAbort("SCOPE_EXCEEDS_CALL_CAP", false);

            String modelVersion = null;
            Map<String, Prediction> predictions = new HashMap<>();
            for (int offset = 0; offset < eligible.size(); offset += CHUNK_SIZE) {
                guard(owner, startedAt, budget);
                List<StationEvaluation> chunk = eligible.subList(offset, Math.min(offset + CHUNK_SIZE, eligible.size()));
                InferenceDtos.PredictResponse response = callChunk(chunk, owner, startedAt, budget);
                ValidatedChunk validated = validate(response, chunk, modelVersion);
                modelVersion = validated.modelVersion();
                predictions.putAll(validated.predictions());
            }
            guard(owner, startedAt, budget);

            List<AdminOpsGlobalRiskRepository.Item> items = new ArrayList<>(stations.size() * HORIZONS.size());
            int normal = 0;
            int insufficient = 0;
            int missing = 0;
            int delayed = 0;
            int unavailable = 0;
            for (StationEvaluation station : stations) {
                Prediction prediction = predictions.get(station.row().stationId());
                String state = station.dataState();
                if (prediction != null) {
                    state = prediction.dataState();
                    if ("NORMAL".equals(state)) normal++; else insufficient++;
                } else if ("MISSING".equals(state)) missing++;
                else if ("DELAYED".equals(state)) delayed++;
                else if ("UNAVAILABLE".equals(state)) unavailable++;
                for (int horizon : HORIZONS) items.add(item(station.row(), state, prediction, horizon, startedAt));
            }

            OffsetDateTime publishedAt = globalRepository.databaseNow();
            long durationMs = elapsedMs(startedNanos);
            if (durationMs > maxWallClockMs) throw new GenerationAbort("WALL_CLOCK_LIMIT", false);
            AdminOpsGlobalRiskRepository.Result result = new AdminOpsGlobalRiskRepository.Result(
                    UUID.randomUUID(), startedAt, publishedAt, publishedAt, publishedAt.plusMinutes(20), publishedAt.plusMinutes(30), modelVersion,
                    stations.size(), eligible.size(), eligible.size(), normal, missing, delayed, unavailable, insufficient, 0, budget.calls, durationMs);
            globalRepository.publish(owner, startedAt, result, items);
            return new Outcome("SUCCESS", null, budget.calls, result.resultId());
        } catch (AdminOpsGlobalRiskRepository.MapPriorityException error) {
            globalRepository.releaseSkipped(owner, "MAP_PRIORITY", budget.calls);
            return new Outcome("SKIPPED", "MAP_PRIORITY", budget.calls, null);
        } catch (GenerationAbort error) {
            if (error.skipped) globalRepository.releaseSkipped(owner, error.reason, budget.calls);
            else globalRepository.recordFailure(owner, error.reason, budget.calls);
            return new Outcome(error.skipped ? "SKIPPED" : "FAILED", error.reason, budget.calls, null);
        } catch (RuntimeException error) {
            globalRepository.recordFailure(owner, "INTERNAL_ERROR", budget.calls);
            return new Outcome("FAILED", "INTERNAL_ERROR", budget.calls, null);
        }
    }

    private InferenceDtos.PredictResponse callChunk(List<StationEvaluation> chunk, UUID owner, OffsetDateTime startedAt, Budget budget) {
        RuntimeException first;
        try {
            budget.beforeCall();
            return inferenceClient.predictAdminChunk(requests(chunk, startedAt));
        } catch (RuntimeException error) {
            if (error instanceof GenerationAbort abort) throw abort;
            if (!retryableTransportFailure(error)) throw new GenerationAbort("INFERENCE_RESPONSE_SCHEMA_MISMATCH", false, error);
            first = error;
        }
        guard(owner, startedAt, budget);
        try {
            sleeper.sleep(retryBackoffMs);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new GenerationAbort("INTERRUPTED", false);
        }
        guard(owner, startedAt, budget);
        try {
            budget.beforeCall();
            return inferenceClient.predictAdminChunk(requests(chunk, startedAt));
        } catch (RuntimeException error) {
            if (error instanceof GenerationAbort abort) throw abort;
            if (!retryableTransportFailure(error)) throw new GenerationAbort("INFERENCE_RESPONSE_SCHEMA_MISMATCH", false, error);
            throw new GenerationAbort("INFERENCE_UNAVAILABLE", false, first);
        }
    }

    private boolean retryableTransportFailure(RuntimeException error) {
        if (error instanceof IllegalArgumentException || Thread.currentThread().isInterrupted()) return false;
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof com.fasterxml.jackson.core.JsonProcessingException) return false;
        }
        return true;
    }

    private List<InferenceDtos.CandidateRequest> requests(List<StationEvaluation> chunk, OffsetDateTime referenceTime) {
        return chunk.stream().map(value -> new InferenceDtos.CandidateRequest(value.row().stationId(), value.row().stationNumber(),
                value.row().currentBikes(), referenceTime)).toList();
    }

    private ValidatedChunk validate(InferenceDtos.PredictResponse response, List<StationEvaluation> chunk, String expectedVersion) {
        if (response == null || !"NORMAL".equals(response.status()) || response.modelVersion() == null || response.modelVersion().isBlank()) {
            throw new GenerationAbort("INVALID_RUNTIME_RESPONSE", false);
        }
        if (expectedVersion != null && !expectedVersion.equals(response.modelVersion())) throw new GenerationAbort("MODEL_VERSION_MISMATCH", false);
        if (response.predictions() == null || response.predictions().size() != chunk.size()) throw new GenerationAbort("CANDIDATE_SET_MISMATCH", false);
        Set<String> expectedIds = chunk.stream().map(value -> value.row().stationId()).collect(java.util.stream.Collectors.toSet());
        Set<String> receivedIds = new HashSet<>();
        Map<String, Prediction> values = new HashMap<>();
        for (InferenceDtos.CandidatePrediction candidate : response.predictions()) {
            if (candidate == null || candidate.stationId() == null || !expectedIds.contains(candidate.stationId()) || !receivedIds.add(candidate.stationId())) {
                throw new GenerationAbort("CANDIDATE_SET_MISMATCH", false);
            }
            if ("MISSING".equals(candidate.status()) || "INSUFFICIENT_DATA".equals(candidate.status())) {
                values.put(candidate.stationId(), new Prediction("INSUFFICIENT_DATA", Map.of()));
            } else if ("NORMAL".equals(candidate.status())) {
                values.put(candidate.stationId(), new Prediction("NORMAL", probabilityMatrix(candidate.rows())));
            } else {
                throw new GenerationAbort("STATION_RUNTIME_UNAVAILABLE", false);
            }
        }
        if (!receivedIds.equals(expectedIds)) throw new GenerationAbort("CANDIDATE_SET_MISMATCH", false);
        return new ValidatedChunk(response.modelVersion(), values);
    }

    private Map<Key, BigDecimal> probabilityMatrix(List<InferenceDtos.ProbabilityRow> rows) {
        if (rows == null || rows.size() != HORIZONS.size() * QUANTITIES.size()) throw new GenerationAbort("PROBABILITY_MATRIX_MISMATCH", false);
        Map<Key, BigDecimal> values = new LinkedHashMap<>();
        for (InferenceDtos.ProbabilityRow row : rows) {
            if (row == null || !HORIZONS.contains(row.horizonMinutes()) || !QUANTITIES.contains(row.requiredBikeCount()) || row.probability() == null
                    || values.put(new Key(row.horizonMinutes(), row.requiredBikeCount()), row.probability()) != null) {
                throw new GenerationAbort("PROBABILITY_MATRIX_MISMATCH", false);
            }
        }
        if (values.size() != 20) throw new GenerationAbort("PROBABILITY_MATRIX_MISMATCH", false);
        for (int horizon : HORIZONS) {
            BigDecimal previous = null;
            for (int quantity : QUANTITIES) {
                BigDecimal value = values.get(new Key(horizon, quantity));
                if (value.compareTo(BigDecimal.ZERO) < 0 || value.compareTo(BigDecimal.ONE) > 0
                        || previous != null && value.compareTo(previous) > 0) {
                    throw new GenerationAbort("PROBABILITY_MATRIX_MISMATCH", false);
                }
                previous = value;
            }
        }
        return Map.copyOf(values);
    }

    private StationEvaluation station(AdminOpsReadRepository.Row row, OffsetDateTime referenceTime) {
        InventoryStatus stored = row.inventoryStatus() == null ? null : InventoryStatus.valueOf(row.inventoryStatus());
        InventoryStatus status = CurrentInventoryEligibility.status(stored, row.collectedAt(), referenceTime);
        if (row.currentBikes() == null && status == InventoryStatus.NORMAL) status = InventoryStatus.MISSING;
        return new StationEvaluation(row, status.name());
    }

    private AdminOpsGlobalRiskRepository.Item item(AdminOpsReadRepository.Row row, String state, Prediction prediction, int horizon, OffsetDateTime referenceTime) {
        Map<Key, BigDecimal> matrix = prediction == null ? Map.of() : prediction.probabilities();
        return new AdminOpsGlobalRiskRepository.Item(row.stationNumber(), horizon, row.name(), row.latitude(), row.longitude(), row.currentBikes(), row.collectedAt(), state,
                matrix.get(new Key(horizon, 1)), matrix.get(new Key(horizon, 2)), matrix.get(new Key(horizon, 3)), matrix.get(new Key(horizon, 4)), matrix.get(new Key(horizon, 5)),
                "NORMAL".equals(state) ? referenceTime.plusMinutes(horizon) : null);
    }

    private void guard(UUID owner, OffsetDateTime startedAt, Budget budget) {
        if (isMapActive() || globalRepository.mapPriorityAfter(startedAt)) throw new GenerationAbort("MAP_PRIORITY", true);
        if (budget.expired()) throw new GenerationAbort("WALL_CLOCK_LIMIT", false);
        if (!globalRepository.leaseOwned(owner)) throw new GenerationAbort("LEASE_LOST", false);
    }

    public void mapStarted() { activeMapEvaluations.incrementAndGet(); }
    public void mapFinished() { activeMapEvaluations.updateAndGet(value -> Math.max(0, value - 1)); }
    private boolean isMapActive() { return activeMapEvaluations.get() > 0; }
    private long elapsedMs(long startedNanos) { return Math.max(0, (nanoTime.getAsLong() - startedNanos) / 1_000_000); }

    private final class Budget {
        private final long startedNanos;
        private int calls;
        private Budget(long startedNanos) { this.startedNanos = startedNanos; }
        private void beforeCall() {
            if (calls >= MAX_CALLS) throw new GenerationAbort("CALL_LIMIT", false);
            if (expired()) throw new GenerationAbort("WALL_CLOCK_LIMIT", false);
            calls++;
        }
        private boolean expired() { return elapsedMs(startedNanos) > maxWallClockMs; }
    }

    @FunctionalInterface interface Sleeper { void sleep(long millis) throws InterruptedException; }
    public record Outcome(String state, String reason, int inferenceCallCount, UUID resultId) { }
    private record StationEvaluation(AdminOpsReadRepository.Row row, String dataState) { }
    private record Prediction(String dataState, Map<Key, BigDecimal> probabilities) { }
    private record ValidatedChunk(String modelVersion, Map<String, Prediction> predictions) { }
    private record Key(int horizon, int quantity) { }
    private static class GenerationAbort extends RuntimeException {
        private final String reason;
        private final boolean skipped;
        private GenerationAbort(String reason, boolean skipped) { this.reason = reason; this.skipped = skipped; }
        private GenerationAbort(String reason, boolean skipped, Throwable cause) { super(cause); this.reason = reason; this.skipped = skipped; }
    }
}
