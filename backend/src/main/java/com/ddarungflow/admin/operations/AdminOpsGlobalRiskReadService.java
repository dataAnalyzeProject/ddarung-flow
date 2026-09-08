package com.ddarungflow.admin.operations;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

@Service
public class AdminOpsGlobalRiskReadService {
    private final AdminOpsGlobalRiskRepository repository;
    private final AdminOpsRiskPolicy policy;

    public AdminOpsGlobalRiskReadService(AdminOpsGlobalRiskRepository repository, AdminOpsRiskPolicy policy) {
        this.repository = repository;
        this.policy = policy;
    }

    public AdminOpsDtos.OverviewResponse overview(OffsetDateTime requestedAt, int horizon, int required) {
        View view = view(repository.databaseNow(), horizon);
        if (!view.servable()) return unavailableOverview(requestedAt, horizon, required, view);
        List<AdminOpsDtos.RiskStation> stations = view.items().stream().map(item -> station(item, required)).toList();
        List<AdminOpsDtos.RiskStation> normal = stations.stream().filter(value -> "NORMAL".equals(value.dataState())).toList();
        List<BigDecimal> shortages = normal.stream().map(value -> value.rentalRisk().selectedShortageProbability()).filter(Objects::nonNull).toList();
        AdminOpsGlobalRiskRepository.Result result = view.result();
        Long valid = normal.isEmpty() ? null : (long) normal.size();
        AdminOpsDtos.RentalRiskSummary summary = new AdminOpsDtos.RentalRiskSummary(required, valid,
                countOrNull(normal, "CRITICAL"), countOrNull(normal, "HIGH"), countOrNull(normal, "WATCH"), countOrNull(normal, "LOW"),
                shortages.isEmpty() ? null : shortages.stream().max(BigDecimal::compareTo).orElse(null), average(shortages));
        List<AdminOpsDtos.RiskStation> priority = normal.stream().sorted(Comparator
                .comparing((AdminOpsDtos.RiskStation value) -> value.rentalRisk().selectedShortageProbability(), Comparator.reverseOrder())
                .thenComparing(value -> value.station().stationNumber())).limit(5).toList();
        return new AdminOpsDtos.OverviewResponse(result.referenceTime(), result.generatedAt(), horizon, capabilities(), aggregate(result), coverage(result),
                limitations(view), AdminOpsRiskPolicy.RULE_VERSION, summary,
                new AdminOpsDtos.InventoryStateSummary((long) result.inventoryEligibleCount(), (long) result.inventoryDelayedCount(),
                        (long) result.inventoryMissingCount(), (long) result.inventoryUnavailableCount()),
                null, scope(result), freshness(view), view.generationState(), result.modelVersion(), result.resultId().toString(), priority,
                result.publishedAt(), globalCoverage(result));
    }

    public View view(OffsetDateTime now, int horizon) {
        AdminOpsGlobalRiskRepository.Current current = repository.current();
        if (current == null || current.result() == null) return new View(null, List.of(), "NOT_GENERATED", false,
                current == null ? null : current.latestAttemptState(), current == null ? null : current.latestAttemptReason());
        AdminOpsGlobalRiskRepository.Result result = current.result();
        String freshness = !now.isAfter(result.freshUntil()) ? "FRESH" : !now.isAfter(result.expiresAt()) ? "STALE" : "EXPIRED";
        boolean servable = !"EXPIRED".equals(freshness);
        return new View(result, servable ? repository.items(result.resultId(), horizon) : List.of(), freshness, servable,
                current.latestAttemptState(), current.latestAttemptReason());
    }

    public View view(OffsetDateTime now, int horizon, String resultId) {
        if (resultId == null) return view(now, horizon);
        AdminOpsGlobalRiskRepository.Result result;
        try { result = repository.result(java.util.UUID.fromString(resultId)); }
        catch (IllegalArgumentException error) { result = null; }
        if (result == null) return new View(null, List.of(), "NOT_GENERATED", false, null, null);
        String freshness = !now.isAfter(result.freshUntil()) ? "FRESH" : !now.isAfter(result.expiresAt()) ? "STALE" : "EXPIRED";
        boolean servable = !"EXPIRED".equals(freshness);
        return new View(result, servable ? repository.items(result.resultId(), horizon) : List.of(), freshness, servable, null, null);
    }

    public View currentView(int horizon, String resultId) {
        return view(repository.databaseNow(), horizon, resultId);
    }

    public AdminOpsDtos.RiskStation station(AdminOpsGlobalRiskRepository.Item item, int required) {
        List<BigDecimal> atLeast = java.util.Arrays.asList(item.atLeast1(), item.atLeast2(), item.atLeast3(), item.atLeast4(), item.atLeast5());
        BigDecimal selected = "NORMAL".equals(item.dataState()) ? policy.selected(atLeast, required) : null;
        AdminOpsDtos.Probabilities probabilities = new AdminOpsDtos.Probabilities(item.atLeast1(), item.atLeast2(), item.atLeast3(), item.atLeast4(), item.atLeast5(),
                policy.shortage(item.atLeast1()), policy.shortage(item.atLeast2()), policy.shortage(item.atLeast3()), policy.shortage(item.atLeast4()), policy.shortage(item.atLeast5()), required, selected);
        return new AdminOpsDtos.RiskStation(new AdminOpsDtos.Station(item.stationNumber(), item.stationName(),
                new AdminOpsDtos.Coordinates(item.latitude(), item.longitude()), item.currentBikes(), null), item.predictionTargetAt(), item.dataState(), policy.band(selected), probabilities);
    }

    public AdminOpsDtos.Coverage coverage(AdminOpsGlobalRiskRepository.Result result) {
        if (result == null) return new AdminOpsDtos.Coverage(null, null, null, null, null, null, null, null, null, null, null, null, null);
        return new AdminOpsDtos.Coverage((long) result.activePublicStationCount(),
                null, (long) result.normalInferenceCount(), null,
                result.inventoryEligibleCount(), result.evaluatedCount(), result.normalInferenceCount(), null,
                result.inventoryMissingCount(), result.inventoryDelayedCount(), result.inventoryUnavailableCount(), result.inferenceInsufficientCount(), result.unevaluatedCount());
    }

    private AdminOpsDtos.OverviewResponse unavailableOverview(OffsetDateTime requestedAt, int horizon, int required, View view) {
        String limitation = "EXPIRED".equals(view.freshnessState()) ? "GLOBAL_RESULT_EXPIRED" : "GLOBAL_RESULT_NOT_GENERATED";
        AdminOpsGlobalRiskRepository.Result result = view.result();
        return new AdminOpsDtos.OverviewResponse(result == null ? requestedAt : result.referenceTime(), result == null ? null : result.generatedAt(), horizon, capabilities(), "INSUFFICIENT_DATA",
                coverage(null), List.of(limitation), AdminOpsRiskPolicy.RULE_VERSION,
                new AdminOpsDtos.RentalRiskSummary(required, null, null, null, null, null, null, null),
                new AdminOpsDtos.InventoryStateSummary(null, null, null, null), null,
                result == null ? new AdminOpsDtos.Scope("GLOBAL", null) : scope(result),
                result == null ? new AdminOpsDtos.Freshness("NOT_GENERATED", null, null) : freshness(view),
                view.generationState(), result == null ? null : result.modelVersion(), result == null ? null : result.resultId().toString(), List.of(),
                result == null ? null : result.publishedAt(), globalCoverage(null));
    }

    private List<String> limitations(View view) {
        java.util.ArrayList<String> values = new java.util.ArrayList<>();
        if ("STALE".equals(view.freshnessState())) values.add("GLOBAL_RESULT_STALE");
        if ("FAILED".equals(view.latestAttemptState())) values.add("LATEST_GLOBAL_GENERATION_FAILED");
        return List.copyOf(values);
    }
    private String aggregate(AdminOpsGlobalRiskRepository.Result result) {
        if (result.normalInferenceCount() == 0) return "INSUFFICIENT_DATA";
        if (result.inventoryUnavailableCount() > 0) return "UNAVAILABLE";
        if (result.inventoryMissingCount() > 0) return "MISSING";
        if (result.inventoryDelayedCount() > 0) return "DELAYED";
        if (result.inferenceInsufficientCount() > 0) return "INSUFFICIENT_DATA";
        return "NORMAL";
    }
    private Long countOrNull(List<AdminOpsDtos.RiskStation> values, String band) { return values.isEmpty() ? null : values.stream().filter(value -> band.equals(value.riskBand())).count(); }
    private BigDecimal average(List<BigDecimal> values) { return values.isEmpty() ? null : values.stream().reduce(BigDecimal.ZERO, BigDecimal::add).divide(BigDecimal.valueOf(values.size()), 7, RoundingMode.HALF_UP); }
    private AdminOpsDtos.Scope scope(AdminOpsGlobalRiskRepository.Result result) { return new AdminOpsDtos.Scope("GLOBAL", result.resultId().toString()); }
    public AdminOpsDtos.GlobalCoverage globalCoverage(AdminOpsGlobalRiskRepository.Result result) {
        if (result == null) return new AdminOpsDtos.GlobalCoverage(null, null, null, null, null, null, null, null, null);
        return new AdminOpsDtos.GlobalCoverage((long) result.activePublicStationCount(), (long) result.inventoryEligibleCount(),
                (long) result.evaluatedCount(), (long) result.normalInferenceCount(), (long) result.inventoryMissingCount(),
                (long) result.inventoryDelayedCount(), (long) result.inventoryUnavailableCount(),
                (long) result.inferenceInsufficientCount(), (long) result.unevaluatedCount());
    }
    private AdminOpsDtos.Freshness freshness(View view) { return new AdminOpsDtos.Freshness(view.freshnessState(), view.result().freshUntil(), view.result().expiresAt()); }
    private AdminOpsDtos.Capabilities capabilities() { return new AdminOpsDtos.Capabilities(new AdminOpsDtos.Capability(true, "private_background_global_inference", null), new AdminOpsDtos.Capability(false, null, "RETURN_INFERENCE_NOT_APPROVED"), new AdminOpsDtos.Capability(false, null, "CAPACITY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "DISTRICT_SOURCE_MISSING"), new AdminOpsDtos.Capability(true, "station_rhythm_profiles", null), new AdminOpsDtos.Capability(false, null, "USAGE_HISTORY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "ALTERNATIVE_RULE_NOT_APPROVED")); }

    public record View(AdminOpsGlobalRiskRepository.Result result, List<AdminOpsGlobalRiskRepository.Item> items,
                       String freshnessState, boolean servable, String latestAttemptState, String latestAttemptReason) {
        public String generationState() { return latestAttemptState == null ? (result == null ? "NOT_GENERATED" : "SUCCESS") : latestAttemptState; }
    }
}
