package com.ddarungflow.admin.operations;

import com.ddarungflow.inventory.InventoryStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminOpsDataStatusService {
    private static final List<String> LIMITATIONS = List.of(
            "AFFECTED_SCOPE_NOT_SOURCE_BACKED",
            "LAST_NORMAL_REFRESH_NOT_SOURCE_BACKED",
            "REASON_LEDGER_NOT_SOURCE_BACKED");

    private final AdminOpsDataStatusRepository repository;

    public AdminOpsDataStatusService(AdminOpsDataStatusRepository repository) { this.repository = repository; }

    public AdminOpsDataStatusDtos.Response dataStatus(OffsetDateTime referenceTime) {
        return dataStatus(referenceTime, false);
    }

    public AdminOpsDataStatusDtos.Response dataStatus(OffsetDateTime referenceTime, boolean includeGlobalInRoot) {
        InventoryResult inventory = inventory(referenceTime);
        PredictionResult prediction = prediction(referenceTime);
        RuntimeAnalysisResult runtimeAnalysis = runtimeAnalysis();
        ProfileResult profile = profile();
        AdminOpsDataStatusDtos.GlobalRisk globalRisk = globalRisk(referenceTime);
        List<String> limitations = new ArrayList<>(LIMITATIONS);
        if (runtimeAnalysis.limitation() != null) limitations.add(runtimeAnalysis.limitation());
        // The canonical DATA root also includes the persisted citywide Global result. The legacy
        // OPS-05 alias preserves its approved inventory/profile headline. prediction remains a
        // historical record and runtimeAnalysis covers one operator-drawn bbox, so neither drives
        // either root.
        String rootState = includeGlobalInRoot
                ? rootState(inventory.state(), profile.state(), globalRisk.dataState())
                : rootState(inventory.state(), profile.state());
        return new AdminOpsDataStatusDtos.Response(referenceTime, OffsetDateTime.now(), rootState,
                inventory.response(), prediction.response(), runtimeAnalysis.response(), profile.response(), globalRisk, limitations);
    }

    private InventoryResult inventory(OffsetDateTime referenceTime) {
        var counts = repository.inventoryCounts();
        List<Long> delays = repository.activeCollectedAt().stream()
                .map(collectedAt -> Math.max(0, Duration.between(collectedAt, referenceTime).toMinutes()))
                .sorted().toList();
        Long p50 = percentile(delays, .50);
        Long p95 = percentile(delays, .95);
        Map<String, Long> breakdown = new LinkedHashMap<>();
        for (InventoryStatus status : InventoryStatus.values()) breakdown.put(status.name(), 0L);
        repository.inventoryStatusCounts().forEach(count -> breakdown.put(count.status(), count.count()));
        boolean unavailableCoverage = breakdown.get("MISSING") > 0 || breakdown.get("UNAVAILABLE") > 0;
        String state = p95 == null || p95 > 180 ? "MISSING"
                : p95 > 30 ? "DELAYED"
                : counts.latestStationCount() < counts.expectedStationCount() || unavailableCoverage ? "PARTIAL" : "NORMAL";
        return new InventoryResult(state, new AdminOpsDataStatusDtos.Inventory(state,
                counts.expectedStationCount(), counts.latestStationCount(),
                Math.max(0, counts.expectedStationCount() - counts.latestStationCount()), counts.latestCollectedAt(),
                p50, p95, breakdown));
    }

    private PredictionResult prediction(OffsetDateTime referenceTime) {
        var batch = repository.findNewestValidBatch(referenceTime);
        if (batch == null) return new PredictionResult("MISSING", null);
        var counts = repository.predictionCounts(batch.batchId());
        long activeStations = repository.activeStationCount();
        BigDecimal coverage = ratio(counts.predictedStationCount(), activeStations);
        String state = counts.predictionRowCount() == 0 ? "INSUFFICIENT_DATA"
                : activeStations > 0 && counts.predictedStationCount() == activeStations ? "NORMAL" : "PARTIAL";
        return new PredictionResult(state, new AdminOpsDataStatusDtos.Prediction(state,
                batch.featureAsOf(), batch.generatedAt(), batch.publishedAt(), batch.expiresAt(),
                counts.predictedStationCount(), counts.predictionRowCount(), coverage));
    }

    /**
     * Reports the current on-demand risk-serving path independently of the legacy batch. A missing
     * or expired snapshot is reported as "정보 부족" evidence with a distinct limitation code so the
     * frontend can tell "no one has analyzed a scope yet" from "the last analysis expired" from a
     * genuinely degraded runtime (every evaluated station failed inference) — never as MISSING,
     * which this repository reserves for a real absence the operator cannot self-serve out of.
     */
    private RuntimeAnalysisResult runtimeAnalysis() {
        var snapshot = repository.latestRiskSnapshot();
        if (snapshot == null) {
            return new RuntimeAnalysisResult("INSUFFICIENT_DATA", "ANALYSIS_SCOPE_REQUIRED",
                    new AdminOpsDataStatusDtos.RuntimeAnalysis("INSUFFICIENT_DATA", false, false,
                            null, null, null, null, null, null, null, null));
        }
        boolean expired = !snapshot.expiresAt().isAfter(OffsetDateTime.now());
        if (expired) {
            return new RuntimeAnalysisResult("INSUFFICIENT_DATA", "ANALYSIS_SNAPSHOT_EXPIRED",
                    new AdminOpsDataStatusDtos.RuntimeAnalysis("INSUFFICIENT_DATA", true, true,
                            snapshot.referenceTime(), snapshot.createdAt(), snapshot.expiresAt(),
                            snapshot.horizonMinutes(), snapshot.requiredBikeCount(),
                            snapshot.eligibleStationCount(), snapshot.evaluatedStationCount(), snapshot.normalInferenceSuccessCount()));
        }
        String state = snapshot.evaluatedStationCount() == 0 ? "INSUFFICIENT_DATA"
                : snapshot.normalInferenceSuccessCount() == 0 ? "UNAVAILABLE"
                : snapshot.normalInferenceSuccessCount() == snapshot.evaluatedStationCount() ? "NORMAL" : "PARTIAL";
        return new RuntimeAnalysisResult(state, null,
                new AdminOpsDataStatusDtos.RuntimeAnalysis(state, true, false,
                        snapshot.referenceTime(), snapshot.createdAt(), snapshot.expiresAt(),
                        snapshot.horizonMinutes(), snapshot.requiredBikeCount(),
                        snapshot.eligibleStationCount(), snapshot.evaluatedStationCount(), snapshot.normalInferenceSuccessCount()));
    }

    private ProfileResult profile() {
        var counts = repository.profileCounts();
        BigDecimal coverage = ratio(counts.profileAvailableStationCount(), counts.activePublicStationCount());
        String state = counts.profileAvailableStationCount() == 0 ? "INSUFFICIENT_DATA"
                : counts.activePublicStationCount() > 0 && counts.profileAvailableStationCount() == counts.activePublicStationCount()
                ? "NORMAL" : "PARTIAL";
        return new ProfileResult(state, new AdminOpsDataStatusDtos.Profile(state,
                counts.activePublicStationCount(), counts.profileAvailableStationCount(), coverage, counts.latestGeneratedAt()));
    }

    private AdminOpsDataStatusDtos.GlobalRisk globalRisk(OffsetDateTime referenceTime) {
        var row = repository.currentGlobalRisk();
        if (row == null) return new AdminOpsDataStatusDtos.GlobalRisk("INSUFFICIENT_DATA", null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        String state = !row.expiresAt().isAfter(referenceTime) ? "UNAVAILABLE"
                : !row.freshUntil().isAfter(referenceTime) ? "DELAYED"
                : row.normalInferenceCount() == 0 ? "INSUFFICIENT_DATA"
                : row.activePublicStationCount() > 0
                && row.evaluatedStationCount() == row.activePublicStationCount()
                && row.normalInferenceCount() == row.activePublicStationCount()
                && row.inventoryMissingCount() == 0
                && row.inventoryDelayedCount() == 0
                && row.inventoryUnavailableCount() == 0
                && row.inferenceInsufficientCount() == 0
                && row.unevaluatedCount() == 0 ? "NORMAL" : "PARTIAL";
        return new AdminOpsDataStatusDtos.GlobalRisk(state, row.resultId().toString(), row.referenceTime(),
                row.publishedAt(), row.freshUntil(), row.expiresAt(), row.activePublicStationCount(),
                row.evaluatedStationCount(), row.normalInferenceCount(), row.inventoryMissingCount(),
                row.inventoryDelayedCount(), row.inventoryUnavailableCount(), row.inferenceInsufficientCount(),
                row.unevaluatedCount(), row.generationDurationMs(), row.modelVersion());
    }

    private Long percentile(List<Long> values, double percentile) {
        return values.isEmpty() ? null : values.get((int) Math.ceil(values.size() * percentile) - 1);
    }

    private BigDecimal ratio(long numerator, long denominator) {
        return denominator == 0 ? null : BigDecimal.valueOf(numerator)
                .divide(BigDecimal.valueOf(denominator), 7, RoundingMode.HALF_UP);
    }

    private String rootState(String... states) {
        List<String> precedence = List.of("MISSING", "UNAVAILABLE", "DELAYED", "INSUFFICIENT_DATA", "PARTIAL", "NORMAL");
        for (String state : precedence) for (String candidate : states) if (state.equals(candidate)) return state;
        throw new IllegalStateException("unknown data state");
    }

    private record InventoryResult(String state, AdminOpsDataStatusDtos.Inventory response) { }
    private record PredictionResult(String state, AdminOpsDataStatusDtos.Prediction response) { }
    private record RuntimeAnalysisResult(String state, String limitation, AdminOpsDataStatusDtos.RuntimeAnalysis response) { }
    private record ProfileResult(String state, AdminOpsDataStatusDtos.Profile response) { }
}
