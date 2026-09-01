package com.ddarungflow.admin.operations;

import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.inventory.CurrentInventoryEligibility;
import com.ddarungflow.inventory.InventoryStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class AdminOpsReadService {
    private static final int SCOPE_CAP = 100;
    private static final int CHUNK_CAP = 20;
    private final AdminOpsReadRepository repository;
    private final AdminOpsRiskPolicy policy;
    private final InferenceClient inferenceClient;
    private final AdminOpsRiskSnapshotService snapshots;
    private final AtomicBoolean evaluating = new AtomicBoolean(false);

    public AdminOpsReadService(AdminOpsReadRepository repository, AdminOpsRiskPolicy policy, InferenceClient inferenceClient,
                               AdminOpsRiskSnapshotService snapshots) {
        this.repository = repository; this.policy = policy; this.inferenceClient = inferenceClient; this.snapshots = snapshots;
    }

    public AdminOpsDtos.OverviewResponse overview(OffsetDateTime referenceTime, int horizon, int required, String snapshotId) {
        if (snapshotId == null || snapshotId.isBlank()) {
            return new AdminOpsDtos.OverviewResponse(referenceTime, OffsetDateTime.now(), horizon, capabilities(), "INSUFFICIENT_DATA",
                    coverage(null), List.of("ANALYSIS_SCOPE_REQUIRED"), AdminOpsRiskPolicy.RULE_VERSION,
                    new AdminOpsDtos.RentalRiskSummary(required, 0, 0, 0, 0, 0, null, null),
                    new AdminOpsDtos.InventoryStateSummary(0, 0, 0, 0), null);
        }
        AdminOpsRiskSnapshotRepository.Header header = snapshots.header(UUID.fromString(snapshotId), OffsetDateTime.now());
        if (header.horizonMinutes() != horizon || header.requiredBikeCount() != required) throw new InvalidCursorException();
        List<AdminOpsRiskSnapshotRepository.Item> items = snapshots.page(header.snapshotId(), 0, SCOPE_CAP);
        List<AdminOpsDtos.RiskStation> stations = items.stream().map(item -> station(item, header.requiredBikeCount())).toList();
        List<BigDecimal> shortages = stations.stream().map(value -> value.rentalRisk().selectedShortageProbability()).filter(java.util.Objects::nonNull).toList();
        return new AdminOpsDtos.OverviewResponse(header.referenceTime(), OffsetDateTime.now(), horizon, capabilities(), aggregate(stations), coverage(header),
                List.of("RECENT_RISK_MAP_SCOPE"), AdminOpsRiskPolicy.RULE_VERSION,
                new AdminOpsDtos.RentalRiskSummary(required, shortages.size(), count(stations, "CRITICAL"), count(stations, "HIGH"), count(stations, "WATCH"), count(stations, "LOW"),
                        shortages.stream().max(BigDecimal::compareTo).orElse(null), average(shortages)), inventory(items), null);
    }
    public AdminOpsDtos.OverviewResponse overview(OffsetDateTime referenceTime, int horizon, int required) { return overview(referenceTime, horizon, required, null); }

    public AdminOpsDtos.RiskStationListResponse list(OffsetDateTime referenceTime, int horizon, int required,
            BigDecimal minLng, BigDecimal minLat, BigDecimal maxLng, BigDecimal maxLat, String dataState, int limit, String cursor, String snapshotId) {
        Cursor decoded = cursor == null || cursor.isBlank() ? null : decode(cursor);
        if (decoded != null) {
            if (snapshotId != null && !snapshotId.isBlank() && !decoded.snapshotId().toString().equals(snapshotId)) throw new InvalidCursorException();
            return pageSnapshot(decoded, horizon, required, minLng, minLat, maxLng, maxLat, dataState, limit);
        }
        if (snapshotId != null && !snapshotId.isBlank()) {
            Cursor snapshot = new Cursor(UUID.fromString(snapshotId), 0);
            return minLng != null || dataState != null
                    ? pageSnapshot(snapshot, horizon, required, minLng, minLat, maxLng, maxLat, dataState, limit)
                    : pageSnapshot(snapshot, horizon, required, limit);
        }
        if (!evaluating.compareAndSet(false, true)) throw new InferenceOverloadedException();
        try {
            List<RowState> scoped = repository.findRows(minLng, minLat, maxLng, maxLat).stream().map(row -> state(row, referenceTime, horizon, required)).toList();
            List<RowState> filtered = dataState == null ? scoped : scoped.stream().filter(row -> dataState.equals(row.dataState())).toList();
            if (filtered.size() > SCOPE_CAP) throw new ScopeTooLargeException();
            List<RowState> evaluated = infer(filtered, referenceTime, horizon, required);
            evaluated = evaluated.stream().sorted(order()).toList();
            String modelVersion = evaluated.stream().map(RowState::modelVersion).filter(java.util.Objects::nonNull).findFirst().orElse("no_runtime_inference");
            UUID id = UUID.randomUUID();
            OffsetDateTime now = OffsetDateTime.now();
            AdminOpsRiskSnapshotRepository.Header header = new AdminOpsRiskSnapshotRepository.Header(id, now, now.plusMinutes(AdminOpsRiskSnapshotService.TTL_MINUTES),
                    referenceTime, horizon, required, minLng, minLat, maxLng, maxLat, dataState, modelVersion, scoped.size(), evaluated.size(),
                    (int) evaluated.stream().filter(row -> "NORMAL".equals(row.dataState())).count());
            List<AdminOpsRiskSnapshotRepository.Item> snapshotItems = new ArrayList<>();
            for (int ordinal = 0; ordinal < evaluated.size(); ordinal++) snapshotItems.add(item(evaluated.get(ordinal), ordinal + 1));
            snapshots.save(header, snapshotItems);
            return response(header, snapshots.page(id, 0, limit), limit);
        } finally {
            evaluating.set(false);
        }
    }
    public AdminOpsDtos.RiskStationListResponse list(OffsetDateTime referenceTime, int horizon, int required,
            BigDecimal minLng, BigDecimal minLat, BigDecimal maxLng, BigDecimal maxLat, String dataState, int limit, String cursor) {
        return list(referenceTime, horizon, required, minLng, minLat, maxLng, maxLat, dataState, limit, cursor, null);
    }

    public AdminOpsDtos.RiskStationDetailResponse detail(OffsetDateTime referenceTime, int horizon, int required, String stationNumber, String snapshotId) {
        if (snapshotId != null && !snapshotId.isBlank()) {
            AdminOpsRiskSnapshotRepository.Header header = snapshots.header(UUID.fromString(snapshotId), OffsetDateTime.now());
            if (header.horizonMinutes() != horizon || header.requiredBikeCount() != required) throw new InvalidCursorException();
            AdminOpsRiskSnapshotRepository.Item item = snapshots.item(header.snapshotId(), stationNumber);
            if (item == null) throw new NotFoundException();
            return new AdminOpsDtos.RiskStationDetailResponse(header.referenceTime(), OffsetDateTime.now(), horizon, capabilities(), item.dataState(), coverage(header),
                    List.of("RECENT_RISK_MAP_SCOPE"), AdminOpsRiskPolicy.RULE_VERSION, station(item, header.requiredBikeCount()), null, header.snapshotId().toString());
        }
        AdminOpsReadRepository.Row row = repository.findDetail(stationNumber);
        if (row == null) throw new NotFoundException();
        RowState evaluated = infer(List.of(state(row, referenceTime, horizon, required)), referenceTime, horizon, required).getFirst();
        return new AdminOpsDtos.RiskStationDetailResponse(referenceTime, OffsetDateTime.now(), horizon, capabilities(), evaluated.dataState(), coverage(null),
                List.of("DIRECT_RUNTIME_INFERENCE"), AdminOpsRiskPolicy.RULE_VERSION, station(evaluated), null, null);
    }
    public AdminOpsDtos.RiskStationDetailResponse detail(OffsetDateTime referenceTime, int horizon, int required, String stationNumber) { return detail(referenceTime, horizon, required, stationNumber, null); }

    private AdminOpsDtos.RiskStationListResponse pageSnapshot(Cursor cursor, int horizon, int required, BigDecimal minLng, BigDecimal minLat,
            BigDecimal maxLng, BigDecimal maxLat, String state, int limit) {
        AdminOpsRiskSnapshotRepository.Header header = snapshots.header(cursor.snapshotId(), OffsetDateTime.now());
        if (header.horizonMinutes() != horizon || header.requiredBikeCount() != required || !same(header.minLng(), minLng) || !same(header.minLat(), minLat)
                || !same(header.maxLng(), maxLng) || !same(header.maxLat(), maxLat) || !java.util.Objects.equals(header.dataStateFilter(), state)) throw new InvalidCursorException();
        return response(header, snapshots.page(header.snapshotId(), cursor.ordinal(), limit), limit);
    }
    private AdminOpsDtos.RiskStationListResponse pageSnapshot(Cursor cursor, int horizon, int required, int limit) {
        AdminOpsRiskSnapshotRepository.Header header = snapshots.header(cursor.snapshotId(), OffsetDateTime.now());
        if (header.horizonMinutes() != horizon || header.requiredBikeCount() != required) throw new InvalidCursorException();
        return response(header, snapshots.page(header.snapshotId(), cursor.ordinal(), limit), limit);
    }

    private AdminOpsDtos.RiskStationListResponse response(AdminOpsRiskSnapshotRepository.Header header, List<AdminOpsRiskSnapshotRepository.Item> page, int limit) {
        boolean more = !page.isEmpty() && page.size() == limit && snapshots.page(header.snapshotId(), page.getLast().ordinal(), 1).size() == 1;
        String next = more ? encode(header.snapshotId(), page.getLast().ordinal()) : null;
        List<AdminOpsDtos.RiskStation> stations = page.stream().map(item -> station(item, header.requiredBikeCount())).toList();
        return new AdminOpsDtos.RiskStationListResponse(header.referenceTime(), OffsetDateTime.now(), header.horizonMinutes(), capabilities(), aggregate(stations), coverage(header),
                limitations(stations.isEmpty()), AdminOpsRiskPolicy.RULE_VERSION, stations, next, header.snapshotId().toString());
    }

    private List<RowState> infer(List<RowState> input, OffsetDateTime reference, int horizon, int required) {
        List<RowState> result = new ArrayList<>(input);
        List<RowState> normal = input.stream().filter(row -> "NORMAL".equals(row.dataState())).toList();
        String expectedVersion = null;
        Map<String, InferenceDtos.CandidatePrediction> predictions = new HashMap<>();
        try {
            for (int offset = 0; offset < normal.size(); offset += CHUNK_CAP) {
                List<RowState> chunk = normal.subList(offset, Math.min(offset + CHUNK_CAP, normal.size()));
                InferenceDtos.PredictResponse response = inferenceClient.predictAdminChunk(chunk.stream().map(row -> new InferenceDtos.CandidateRequest(
                        row.row().stationId(), row.row().stationNumber(), row.row().currentBikes(), reference.truncatedTo(ChronoUnit.HOURS))).toList());
                if (!"NORMAL".equals(response.status()) || response.modelVersion() == null || response.modelVersion().isBlank()) throw new InferenceUnavailableException();
                if (expectedVersion != null && !expectedVersion.equals(response.modelVersion())) throw new InferenceUnavailableException();
                expectedVersion = response.modelVersion();
                if (response.predictions() == null || response.predictions().size() != chunk.size()) throw new InferenceUnavailableException();
                var expectedStationIds = chunk.stream().map(row -> row.row().stationId()).collect(java.util.stream.Collectors.toSet());
                var receivedStationIds = new HashSet<String>();
                for (InferenceDtos.CandidatePrediction prediction : response.predictions()) {
                    if (prediction == null || prediction.stationId() == null || !receivedStationIds.add(prediction.stationId()) || !expectedStationIds.contains(prediction.stationId())) throw new InferenceUnavailableException();
                    predictions.put(prediction.stationId(), prediction);
                }
                if (!receivedStationIds.equals(expectedStationIds)) throw new InferenceUnavailableException();
            }
        } catch (RuntimeException error) { throw new InferenceUnavailableException(); }
        for (int index = 0; index < result.size(); index++) {
            RowState value = result.get(index);
            if (!"NORMAL".equals(value.dataState())) continue;
            InferenceDtos.CandidatePrediction prediction = predictions.get(value.row().stationId());
            if (prediction == null || "MISSING".equals(prediction.status())) result.set(index, value.withData("INSUFFICIENT_DATA", null, null));
            else if (!"NORMAL".equals(prediction.status())) result.set(index, value.withData("UNAVAILABLE", null, null));
            else result.set(index, value.withData("NORMAL", probabilities(prediction.rows(), horizon, required), expectedVersion));
        }
        return result;
    }

    private List<BigDecimal> probabilities(List<InferenceDtos.ProbabilityRow> rows, int horizon, int required) {
        List<BigDecimal> values = new ArrayList<>();
        for (int quantity = 1; quantity <= 5; quantity++) {
            int requiredBikeCount = quantity;
            BigDecimal value = rows.stream().filter(row -> row.horizonMinutes() == horizon && row.requiredBikeCount() == requiredBikeCount).map(InferenceDtos.ProbabilityRow::probability).findFirst().orElse(null);
            if (value == null) throw new InferenceUnavailableException();
            values.add(value);
        }
        return values;
    }

    private RowState state(AdminOpsReadRepository.Row row, OffsetDateTime reference, int horizon, int required) {
        InventoryStatus stored = row.inventoryStatus() == null ? null : InventoryStatus.valueOf(row.inventoryStatus());
        InventoryStatus status = CurrentInventoryEligibility.status(stored, row.collectedAt(), reference);
        if (row.currentBikes() == null && status == InventoryStatus.NORMAL) status = InventoryStatus.MISSING;
        return new RowState(row, status.name(), null, null, reference, horizon, required);
    }
    private AdminOpsRiskSnapshotRepository.Item item(RowState value, int ordinal) {
        List<BigDecimal> p = value.probabilities();
        BigDecimal selected = p == null ? null : policy.selected(p, value.required());
        return new AdminOpsRiskSnapshotRepository.Item(ordinal, value.row().stationNumber(), value.row().name(), value.row().latitude(), value.row().longitude(), value.row().currentBikes(),
                value.dataState(), at(p, 0), at(p, 1), at(p, 2), at(p, 3), at(p, 4), selected, policy.band(selected),
                p == null ? null : value.referenceTime().plusMinutes(value.horizon()));
    }
    private AdminOpsDtos.RiskStation station(AdminOpsRiskSnapshotRepository.Item item, int required) {
        return station(item.stationNumber(), item.stationName(), item.latitude(), item.longitude(), item.currentBikes(), item.dataState(),
                java.util.Arrays.asList(item.atLeast1(), item.atLeast2(), item.atLeast3(), item.atLeast4(), item.atLeast5()), item.selectedShortage(), item.riskBand(), item.predictionTargetAt(), required);
    }
    private AdminOpsDtos.RiskStation station(RowState value) {
        List<BigDecimal> p = value.probabilities();
        BigDecimal selected = p == null ? null : policy.selected(p, value.required());
        return station(value.row().stationNumber(), value.row().name(), value.row().latitude(), value.row().longitude(), value.row().currentBikes(), value.dataState(), p, selected, policy.band(selected),
                p == null ? null : value.referenceTime().plusMinutes(value.horizon()), value.required());
    }
    private AdminOpsDtos.RiskStation station(String number, String name, BigDecimal lat, BigDecimal lng, Integer bikes, String dataState, List<BigDecimal> p, BigDecimal selected, String band, OffsetDateTime target, int required) {
        AdminOpsDtos.Probabilities probabilities = new AdminOpsDtos.Probabilities(at(p, 0), at(p, 1), at(p, 2), at(p, 3), at(p, 4), policy.shortage(at(p, 0)), policy.shortage(at(p, 1)), policy.shortage(at(p, 2)), policy.shortage(at(p, 3)), policy.shortage(at(p, 4)), required, selected);
        return new AdminOpsDtos.RiskStation(new AdminOpsDtos.Station(number, name, new AdminOpsDtos.Coordinates(lat, lng), bikes, null), target, dataState, band, probabilities);
    }
    private AdminOpsDtos.Capabilities capabilities() { return new AdminOpsDtos.Capabilities(new AdminOpsDtos.Capability(true, "private_on_demand_inference", null), new AdminOpsDtos.Capability(false, null, "RETURN_INFERENCE_NOT_APPROVED"), new AdminOpsDtos.Capability(false, null, "CAPACITY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "DISTRICT_SOURCE_MISSING"), new AdminOpsDtos.Capability(true, "station_rhythm_profiles", null), new AdminOpsDtos.Capability(false, null, "USAGE_HISTORY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "ALTERNATIVE_RULE_NOT_APPROVED")); }
    private AdminOpsDtos.Coverage coverage(AdminOpsRiskSnapshotRepository.Header header) { var row = repository.coverage(); return new AdminOpsDtos.Coverage(row.activeStationCount(), row.inventoryAvailableCount(), null, row.profileAvailableCount(), header == null ? null : header.eligibleStationCount(), header == null ? null : header.evaluatedStationCount(), header == null ? null : header.normalInferenceSuccessCount(), SCOPE_CAP); }
    private List<String> limitations(boolean empty) { List<String> result = new ArrayList<>(); if (repository.activePublicStationCount() == 0) result.add("NO_ACTIVE_PUBLIC_STATIONS"); else if (empty) result.add("NO_MATCHING_STATIONS"); if (repository.activeStationsWithoutPublicNumber() > 0) result.add("STATION_NUMBER_MISSING"); return result; }
    private String aggregate(List<AdminOpsDtos.RiskStation> stations) { if (stations.stream().anyMatch(s -> "UNAVAILABLE".equals(s.dataState()))) return "UNAVAILABLE"; if (stations.stream().anyMatch(s -> "MISSING".equals(s.dataState()))) return "MISSING"; if (stations.stream().anyMatch(s -> "DELAYED".equals(s.dataState()))) return "DELAYED"; if (stations.stream().anyMatch(s -> "INSUFFICIENT_DATA".equals(s.dataState()))) return "INSUFFICIENT_DATA"; return "NORMAL"; }
    private long count(List<AdminOpsDtos.RiskStation> stations, String band) { return stations.stream().filter(item -> band.equals(item.riskBand())).count(); }
    private BigDecimal average(List<BigDecimal> values) { return values.isEmpty() ? null : values.stream().reduce(BigDecimal.ZERO, BigDecimal::add).divide(BigDecimal.valueOf(values.size()), 7, RoundingMode.HALF_UP); }
    private AdminOpsDtos.InventoryStateSummary inventory(List<AdminOpsRiskSnapshotRepository.Item> items) { return new AdminOpsDtos.InventoryStateSummary(items.stream().filter(i -> "NORMAL".equals(i.dataState())).count(), items.stream().filter(i -> "DELAYED".equals(i.dataState())).count(), items.stream().filter(i -> "MISSING".equals(i.dataState())).count(), items.stream().filter(i -> "UNAVAILABLE".equals(i.dataState())).count()); }
    private Comparator<RowState> order() { return Comparator.comparing((RowState value) -> value.probabilities() == null ? null : policy.selected(value.probabilities(), value.required()), Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(value -> value.row().stationNumber()); }
    private String encode(UUID snapshotId, int ordinal) { return Base64.getUrlEncoder().withoutPadding().encodeToString((snapshotId + "|" + ordinal).getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    private Cursor decode(String value) { try { String[] parts = new String(Base64.getUrlDecoder().decode(value), java.nio.charset.StandardCharsets.UTF_8).split("\\|", -1); if (parts.length != 2) throw new IllegalArgumentException(); return new Cursor(UUID.fromString(parts[0]), Integer.parseInt(parts[1])); } catch (RuntimeException e) { throw new InvalidCursorException(); } }
    private boolean same(BigDecimal left, BigDecimal right) { return left == null ? right == null : right != null && left.compareTo(right) == 0; }
    private BigDecimal at(List<BigDecimal> values, int index) { return values == null || values.size() <= index ? null : values.get(index); }
    private record Cursor(UUID snapshotId, int ordinal) { }
    private record RowState(AdminOpsReadRepository.Row row, String dataState, List<BigDecimal> probabilities, String modelVersion, OffsetDateTime referenceTime, int horizon, int required) {
        RowState withData(String state, List<BigDecimal> p, String model) { return new RowState(row, state, p, model, referenceTime, horizon, required); }
    }
    public static class NotFoundException extends RuntimeException { }
    public static class ScopeTooLargeException extends RuntimeException { }
    public static class InferenceUnavailableException extends RuntimeException { }
    public static class InferenceOverloadedException extends RuntimeException { }
    public static class InvalidCursorException extends RuntimeException { }
}
