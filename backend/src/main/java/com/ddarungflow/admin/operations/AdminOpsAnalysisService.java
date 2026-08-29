package com.ddarungflow.admin.operations;

import org.springframework.stereotype.Service;
import org.springframework.dao.DataAccessException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;

@Service
public class AdminOpsAnalysisService {
    public static final String RULE_VERSION = "OPS_ANALYSIS_STOCKOUT_V1";
    private final AdminOpsAnalysisRepository repository;
    private final StationRhythmProfileParser parser;
    public AdminOpsAnalysisService(AdminOpsAnalysisRepository repository, StationRhythmProfileParser parser) { this.repository = repository; this.parser = parser; }

    public AdminOpsAnalysisDtos.Response analyze(OffsetDateTime referenceTime, String view, String riskType) {
        try {
            return analyzeAvailable(referenceTime, view, riskType);
        } catch (DataAccessException error) {
            return unavailable(referenceTime, view, riskType);
        }
    }

    private AdminOpsAnalysisDtos.Response analyzeAvailable(OffsetDateTime referenceTime, String view, String riskType) {
        long active = repository.activePublicStationCount();
        List<AdminOpsAnalysisRepository.ProfileRow> all = repository.findActivePublicProfiles();
        Cohort cohort = selectCohort(all);
        List<AdminOpsAnalysisRepository.ProfileRow> selected = cohort == null ? List.of() : all.stream().filter(row -> row.windowStart().equals(cohort.windowStart()) && row.windowEnd().equals(cohort.windowEnd())).toList();
        Map<StationRhythmProfileParser.CellKey, Aggregate> cells = new HashMap<>();
        long parsed = 0;
        boolean partialInvalid = false;
        for (var row : selected) {
            var profile = parser.parse(row.payload());
            if (!profile.valid()) { partialInvalid = true; continue; }
            parsed++;
            partialInvalid |= profile.partialInvalid();
            for (var cell : profile.cells().values()) {
                cells.computeIfAbsent(new StationRhythmProfileParser.CellKey(cell.dayOfWeek(), cell.hourOfDay()), ignored -> new Aggregate()).add(row.stationNumber(), cell);
            }
        }
        long usable = cells.values().stream().mapToLong(Aggregate::cellCount).sum();
        long expected = selected.size() * 168L;
        List<AdminOpsAnalysisDtos.WeekdayHourCell> weekdayHour = weekdayHourCells(cells);
        List<AdminOpsAnalysisDtos.Bucket> buckets = "WEEKDAY".equals(view) ? weekdayBuckets(cells) : hourBuckets(cells);
        List<String> limitations = new ArrayList<>();
        limitations.add("DISTRICT_SOURCE_MISSING"); limitations.add("PERIOD_FILTER_UNAVAILABLE"); limitations.add("DAILY_TREND_SOURCE_MISSING");
        if (all.size() > selected.size()) limitations.add("PROFILE_WINDOW_MISMATCH");
        if (partialInvalid && usable > 0) limitations.add("PROFILE_PARTIAL_INVALID");
        String state = active > 0 && (all.isEmpty() || usable == 0) ? "INSUFFICIENT_DATA" : "NORMAL";
        var coverage = new AdminOpsAnalysisDtos.Coverage(active, (long) all.size(), (long) selected.size(), parsed, usable, expected, divide(selected.size(), active), divide(usable, expected));
        return new AdminOpsAnalysisDtos.Response(referenceTime, OffsetDateTime.now(), view, riskType, RULE_VERSION, "OPS_ANALYSIS_WINDOW_V1", "OBSERVED_STOCKOUT_RATE", capabilities(), state, coverage, limitations,
                cohort == null ? null : cohort.windowStart(), cohort == null ? null : cohort.windowEnd(), (long) selected.size(), (long) (all.size() - selected.size()), buckets, weekdayHour);
    }

    private AdminOpsAnalysisDtos.Response unavailable(OffsetDateTime referenceTime, String view, String riskType) {
        List<AdminOpsAnalysisDtos.WeekdayHourCell> weekdayHour = weekdayHourCells(Map.of());
        List<AdminOpsAnalysisDtos.Bucket> buckets = "WEEKDAY".equals(view) ? weekdayBuckets(Map.of()) : hourBuckets(Map.of());
        var coverage = new AdminOpsAnalysisDtos.Coverage(null, null, null, null, null, null, null, null);
        return new AdminOpsAnalysisDtos.Response(referenceTime, OffsetDateTime.now(), view, riskType, RULE_VERSION, "OPS_ANALYSIS_WINDOW_V1", "OBSERVED_STOCKOUT_RATE", capabilities(), "UNAVAILABLE", coverage,
                List.of("DISTRICT_SOURCE_MISSING", "PERIOD_FILTER_UNAVAILABLE", "DAILY_TREND_SOURCE_MISSING"), null, null, null, null, buckets, weekdayHour);
    }
    private Cohort selectCohort(List<AdminOpsAnalysisRepository.ProfileRow> rows) {
        return rows.stream().collect(java.util.stream.Collectors.groupingBy(row -> new Cohort(row.windowStart(), row.windowEnd()), java.util.stream.Collectors.counting())).entrySet().stream()
                .sorted(Map.Entry.<Cohort, Long>comparingByValue().reversed().thenComparing(entry -> entry.getKey().windowEnd(), Comparator.reverseOrder()).thenComparing(entry -> entry.getKey().windowStart(), Comparator.reverseOrder()))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }
    private List<AdminOpsAnalysisDtos.Bucket> weekdayBuckets(Map<StationRhythmProfileParser.CellKey, Aggregate> cells) { List<AdminOpsAnalysisDtos.Bucket> result = new ArrayList<>(); for (int day = 1; day <= 7; day++) { Aggregate sum = new Aggregate(); for (int hour = 0; hour < 24; hour++) sum.combine(cells.get(new StationRhythmProfileParser.CellKey(day, hour))); result.add(new AdminOpsAnalysisDtos.Bucket(day, sum.samples, sum.contributingStationCount(), sum.rate())); } return result; }
    private List<AdminOpsAnalysisDtos.Bucket> hourBuckets(Map<StationRhythmProfileParser.CellKey, Aggregate> cells) { List<AdminOpsAnalysisDtos.Bucket> result = new ArrayList<>(); for (int hour = 0; hour < 24; hour++) { Aggregate sum = new Aggregate(); for (int day = 1; day <= 7; day++) sum.combine(cells.get(new StationRhythmProfileParser.CellKey(day, hour))); result.add(new AdminOpsAnalysisDtos.Bucket(hour, sum.samples, sum.contributingStationCount(), sum.rate())); } return result; }
    private List<AdminOpsAnalysisDtos.WeekdayHourCell> weekdayHourCells(Map<StationRhythmProfileParser.CellKey, Aggregate> cells) { List<AdminOpsAnalysisDtos.WeekdayHourCell> result = new ArrayList<>(); for (int day = 1; day <= 7; day++) for (int hour = 0; hour < 24; hour++) { Aggregate sum = cells.getOrDefault(new StationRhythmProfileParser.CellKey(day, hour), new Aggregate()); result.add(new AdminOpsAnalysisDtos.WeekdayHourCell(day, hour, sum.samples, sum.contributingStationCount(), sum.rate())); } return result; }
    private BigDecimal divide(long numerator, long denominator) { return denominator == 0 ? null : BigDecimal.valueOf(numerator).divide(BigDecimal.valueOf(denominator), 7, RoundingMode.HALF_UP); }
    private AdminOpsDtos.Capabilities capabilities() { return new AdminOpsDtos.Capabilities(new AdminOpsDtos.Capability(true, "station_predictions + prediction_batches", null), new AdminOpsDtos.Capability(false, null, "RETURN_INFERENCE_NOT_APPROVED"), new AdminOpsDtos.Capability(false, null, "CAPACITY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "DISTRICT_SOURCE_MISSING"), new AdminOpsDtos.Capability(true, "station_rhythm_profiles", null), new AdminOpsDtos.Capability(false, null, "USAGE_HISTORY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "ALTERNATIVE_RULE_NOT_APPROVED")); }
    private record Cohort(java.time.LocalDate windowStart, java.time.LocalDate windowEnd) { }
    private static final class Aggregate { long samples; long cells; Set<String> stationNumbers = new HashSet<>(); BigDecimal weighted = BigDecimal.ZERO; void add(String stationNumber, StationRhythmProfileParser.Cell cell) { samples += cell.sampleCount(); cells++; stationNumbers.add(stationNumber); weighted = weighted.add(cell.stockoutRate().multiply(BigDecimal.valueOf(cell.sampleCount()))); } void combine(Aggregate other) { if (other == null) return; samples += other.samples; cells += other.cells; stationNumbers.addAll(other.stationNumbers); weighted = weighted.add(other.weighted); } long cellCount() { return cells; } long contributingStationCount() { return stationNumbers.size(); } BigDecimal rate() { return samples == 0 ? null : weighted.divide(BigDecimal.valueOf(samples), 7, RoundingMode.HALF_UP); } }
}
