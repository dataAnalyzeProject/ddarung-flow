package com.ddarungflow.admin.operations;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;

@Service
public class AdminOpsReadService {
    private final AdminOpsReadRepository repository;
    private final AdminOpsRiskPolicy policy;

    public AdminOpsReadService(AdminOpsReadRepository repository, AdminOpsRiskPolicy policy) {
        this.repository = repository; this.policy = policy;
    }

    public AdminOpsDtos.OverviewResponse overview(OffsetDateTime referenceTime, int horizon, int required) {
        List<AdminOpsReadRepository.Row> rows = repository.findRows(referenceTime, horizon, null, null, null, null, null);
        List<AdminOpsDtos.RiskStation> stations = rows.stream().map(row -> station(row, required)).toList();
        long critical = stations.stream().filter(item -> "CRITICAL".equals(item.riskBand())).count();
        long high = stations.stream().filter(item -> "HIGH".equals(item.riskBand())).count();
        long watch = stations.stream().filter(item -> "WATCH".equals(item.riskBand())).count();
        long low = stations.stream().filter(item -> "LOW".equals(item.riskBand())).count();
        List<BigDecimal> shortages = stations.stream().map(item -> item.rentalRisk().selectedShortageProbability()).filter(java.util.Objects::nonNull).toList();
        BigDecimal max = shortages.stream().max(BigDecimal::compareTo).orElse(null);
        BigDecimal average = shortages.isEmpty() ? null : shortages.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(shortages.size()), 7, java.math.RoundingMode.HALF_UP);
        return new AdminOpsDtos.OverviewResponse(referenceTime, OffsetDateTime.now(), horizon, capabilities(), aggregate(rows),
                coverage(referenceTime, horizon), limitations(rows), AdminOpsRiskPolicy.RULE_VERSION,
                new AdminOpsDtos.RentalRiskSummary(required, shortages.size(), critical, high, watch, low, max, average),
                new AdminOpsDtos.InventoryStateSummary(count(rows, "NORMAL"), count(rows, "DELAYED"), count(rows, "MISSING"), count(rows, "UNAVAILABLE")), null);
    }

    public AdminOpsDtos.RiskStationListResponse list(OffsetDateTime referenceTime, int horizon, int required,
                                                      BigDecimal minLng, BigDecimal minLat, BigDecimal maxLng, BigDecimal maxLat,
                                                      String dataState, int limit, String cursor) {
        Cursor decoded = decode(cursor, horizon, required);
        referenceTime = decoded == null ? referenceTime : decoded.referenceTime();
        List<AdminOpsReadRepository.Row> rows = repository.findRows(referenceTime, horizon, minLng, minLat, maxLng, maxLat, dataState);
        List<AdminOpsDtos.RiskStation> all = rows.stream().map(row -> station(row, required)).sorted(order()).toList();
        List<AdminOpsDtos.RiskStation> remaining = decoded == null ? all : all.stream().filter(value -> after(value, decoded)).toList();
        int end = Math.min(limit, remaining.size());
        List<AdminOpsDtos.RiskStation> page = remaining.subList(0, end);
        String next = end < remaining.size() ? encode(page.get(page.size() - 1), referenceTime, horizon, required) : null;
        return new AdminOpsDtos.RiskStationListResponse(referenceTime, OffsetDateTime.now(), horizon, capabilities(), aggregate(rows),
                coverage(referenceTime, horizon), limitations(rows), AdminOpsRiskPolicy.RULE_VERSION, page, next);
    }

    public AdminOpsDtos.RiskStationDetailResponse detail(OffsetDateTime referenceTime, int horizon, int required, String stationNumber) {
        AdminOpsReadRepository.Row row = repository.findRows(referenceTime, horizon, null, null, null, null, null).stream()
                .filter(candidate -> stationNumber.equals(candidate.stationNumber())).findFirst().orElseThrow(NotFoundException::new);
        List<AdminOpsReadRepository.Row> only = List.of(row);
        return new AdminOpsDtos.RiskStationDetailResponse(referenceTime, OffsetDateTime.now(), horizon, capabilities(), row.dataState(),
                coverage(referenceTime, horizon), limitations(only), AdminOpsRiskPolicy.RULE_VERSION, station(row, required), null);
    }

    private AdminOpsDtos.RiskStation station(AdminOpsReadRepository.Row row, int required) {
        List<BigDecimal> values = java.util.Arrays.asList(row.atLeast1(), row.atLeast2(), row.atLeast3(), row.atLeast4(), row.atLeast5());
        BigDecimal selected = policy.selected(values, required);
        AdminOpsDtos.Probabilities probabilities = new AdminOpsDtos.Probabilities(row.atLeast1(), row.atLeast2(), row.atLeast3(), row.atLeast4(), row.atLeast5(),
                policy.shortage(row.atLeast1()), policy.shortage(row.atLeast2()), policy.shortage(row.atLeast3()), policy.shortage(row.atLeast4()), policy.shortage(row.atLeast5()), required, selected);
        return new AdminOpsDtos.RiskStation(new AdminOpsDtos.Station(row.stationNumber(), row.name(),
                new AdminOpsDtos.Coordinates(row.latitude(), row.longitude()), row.currentBikes(), null), row.predictionTargetAt(), row.dataState(),
                policy.band(selected), probabilities);
    }

    private AdminOpsDtos.Capabilities capabilities() {
        return new AdminOpsDtos.Capabilities(new AdminOpsDtos.Capability(true, "station_predictions + prediction_batches", null),
                new AdminOpsDtos.Capability(false, null, "RETURN_INFERENCE_NOT_APPROVED"), new AdminOpsDtos.Capability(false, null, "CAPACITY_SOURCE_MISSING"),
                new AdminOpsDtos.Capability(false, null, "DISTRICT_SOURCE_MISSING"), new AdminOpsDtos.Capability(true, "station_rhythm_profiles", null),
                new AdminOpsDtos.Capability(false, null, "USAGE_HISTORY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "ALTERNATIVE_RULE_NOT_APPROVED"));
    }
    private AdminOpsDtos.Coverage coverage(OffsetDateTime reference, int horizon) {
        var row = repository.coverage(reference, horizon);
        return new AdminOpsDtos.Coverage(row.activeStationCount(), row.inventoryAvailableCount(), row.predictionAvailableCount(), row.profileAvailableCount());
    }
    private List<String> limitations(List<AdminOpsReadRepository.Row> rows) {
        List<String> result = new ArrayList<>();
        if (rows.isEmpty()) result.add("NO_ACTIVE_PUBLIC_STATIONS");
        if (repository.activeStationsWithoutPublicNumber() > 0) result.add("STATION_NUMBER_MISSING");
        return result;
    }
    private long count(List<AdminOpsReadRepository.Row> rows, String state) { return rows.stream().filter(row -> state.equals(row.dataState())).count(); }
    private String aggregate(List<AdminOpsReadRepository.Row> rows) {
        if (rows.stream().anyMatch(row -> "UNAVAILABLE".equals(row.dataState()))) return "UNAVAILABLE";
        if (rows.stream().anyMatch(row -> "MISSING".equals(row.dataState()))) return "MISSING";
        if (rows.stream().anyMatch(row -> "DELAYED".equals(row.dataState()))) return "DELAYED";
        if (rows.stream().anyMatch(row -> "INSUFFICIENT_DATA".equals(row.dataState()))) return "INSUFFICIENT_DATA";
        return "NORMAL";
    }
    private Comparator<AdminOpsDtos.RiskStation> order() {
        return Comparator.comparing((AdminOpsDtos.RiskStation value) -> value.rentalRisk().selectedShortageProbability(), Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(value -> value.station().stationNumber());
    }
    private boolean after(AdminOpsDtos.RiskStation station, Cursor cursor) {
        BigDecimal probability = station.rentalRisk().selectedShortageProbability();
        if (cursor.selectedProbability() == null) return probability == null && station.station().stationNumber().compareTo(cursor.stationNumber()) > 0;
        if (probability == null) return true;
        int comparison = probability.compareTo(cursor.selectedProbability());
        return comparison < 0 || (comparison == 0 && station.station().stationNumber().compareTo(cursor.stationNumber()) > 0);
    }
    private String encode(AdminOpsDtos.RiskStation station, OffsetDateTime reference, int horizon, int required) {
        String probability = station.rentalRisk().selectedShortageProbability() == null ? "" : station.rentalRisk().selectedShortageProbability().toPlainString();
        return Base64.getUrlEncoder().withoutPadding().encodeToString((reference + "|" + probability + "|" + station.station().stationNumber() + "|" + horizon + "|" + required).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    private Cursor decode(String value, int horizon, int required) {
        if (value == null || value.isBlank()) return null;
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), java.nio.charset.StandardCharsets.UTF_8).split("\\|", -1);
            if (parts.length != 5 || horizon != Integer.parseInt(parts[3]) || required != Integer.parseInt(parts[4])) throw new IllegalArgumentException("invalid cursor");
            return new Cursor(OffsetDateTime.parse(parts[0]), parts[1].isEmpty() ? null : new BigDecimal(parts[1]), parts[2]);
        } catch (RuntimeException error) { throw new IllegalArgumentException("invalid cursor"); }
    }
    private record Cursor(OffsetDateTime referenceTime, BigDecimal selectedProbability, String stationNumber) { }
    public static class NotFoundException extends RuntimeException { }
}
