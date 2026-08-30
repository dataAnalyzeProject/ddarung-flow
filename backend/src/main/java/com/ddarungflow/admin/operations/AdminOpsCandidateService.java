package com.ddarungflow.admin.operations;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminOpsCandidateService {
    public static final String RULE_VERSION = "OPS_CANDIDATE_RENTAL_V1";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final AdminOpsReadRepository readRepository;
    private final AdminOpsCandidateRepository candidateRepository;
    private final AdminOpsRiskPolicy policy;
    private final StationRhythmProfileParser parser;

    public AdminOpsCandidateService(AdminOpsReadRepository readRepository, AdminOpsCandidateRepository candidateRepository, AdminOpsRiskPolicy policy, StationRhythmProfileParser parser) {
        this.readRepository = readRepository; this.candidateRepository = candidateRepository; this.policy = policy; this.parser = parser;
    }

    public AdminOpsCandidateDtos.Response list(OffsetDateTime requestedReference, int horizon, int required, String riskType, int limit, String cursor) {
        Cursor decoded = decode(cursor, horizon, required, riskType);
        OffsetDateTime reference = decoded == null ? requestedReference : decoded.referenceTime();
        List<AdminOpsReadRepository.Row> rows = readRepository.findRows(reference, horizon, null, null, null, null, null);
        List<AdminOpsReadRepository.Row> eligible = rows.stream().filter(row -> "NORMAL".equals(row.inventoryDataState()) && "NORMAL".equals(row.dataState())).toList();
        Map<String, AdminOpsCandidateRepository.ProfileRow> profiles = new HashMap<>();
        for (AdminOpsCandidateRepository.ProfileRow profile : candidateRepository.findProfiles(eligible.stream().map(AdminOpsReadRepository.Row::stationNumber).toList())) profiles.put(profile.stationNumber(), profile);
        List<Ranked> ranked = new ArrayList<>();
        for (AdminOpsReadRepository.Row row : eligible) ranked.add(new Ranked(candidate(row, required, profiles.get(row.stationNumber())), 0));
        ranked.sort(Comparator.comparing((Ranked value) -> value.candidate().prediction().selectedShortageProbability(), Comparator.reverseOrder())
                .thenComparing(value -> value.candidate().prediction().predictionTargetAt()).thenComparing(value -> value.candidate().station().stationNumber()));
        List<Ranked> numbered = new ArrayList<>();
        for (int index = 0; index < ranked.size(); index++) numbered.add(new Ranked(ranked.get(index).candidate(), index + 1L));
        int start = decoded == null ? 0 : afterCursor(numbered, decoded);
        int end = Math.min(start + limit, numbered.size());
        List<AdminOpsCandidateDtos.Candidate> page = numbered.subList(start, end).stream().map(value -> withRank(value.candidate(), value.rank())).toList();
        String next = end < numbered.size() ? encode(numbered.get(end - 1).candidate(), reference, horizon, required, riskType) : null;
        var coverage = readRepository.coverage(reference, horizon);
        return new AdminOpsCandidateDtos.Response(reference, OffsetDateTime.now(), horizon, required, riskType, RULE_VERSION, capabilities(), aggregate(rows),
                new AdminOpsCandidateDtos.Coverage(readRepository.activePublicStationCount(), coverage.inventoryAvailableCount(), coverage.predictionAvailableCount(), coverage.profileAvailableCount(), numbered.size()),
                limitations(rows, eligible), page, next);
    }

    private AdminOpsCandidateDtos.Candidate candidate(AdminOpsReadRepository.Row row, int required, AdminOpsCandidateRepository.ProfileRow profile) {
        BigDecimal selected = policy.selected(List.of(row.atLeast1(), row.atLeast2(), row.atLeast3(), row.atLeast4(), row.atLeast5()), required);
        var station = new AdminOpsDtos.Station(row.stationNumber(), row.name(), new AdminOpsDtos.Coordinates(row.latitude(), row.longitude()), row.currentBikes(), null);
        var factors = new AdminOpsCandidateDtos.RankingFactors(new AdminOpsCandidateDtos.Factor(selected, "PRIMARY_SORT"),
                new AdminOpsCandidateDtos.Factor(row.predictionTargetAt(), "SECONDARY_SORT"), "SUPPORTING_EVIDENCE", "ELIGIBILITY_EVIDENCE");
        return new AdminOpsCandidateDtos.Candidate(0, RULE_VERSION, station, new AdminOpsCandidateDtos.Prediction(row.predictionTargetAt(), required, selected), factors, recurrence(profile, row.predictionTargetAt()), row.dataState());
    }
    private AdminOpsCandidateDtos.Candidate withRank(AdminOpsCandidateDtos.Candidate candidate, long rank) {
        return new AdminOpsCandidateDtos.Candidate(rank, candidate.ruleVersion(), candidate.station(), candidate.prediction(), candidate.rankingFactors(), candidate.recurrence(), candidate.dataState());
    }
    private AdminOpsCandidateDtos.Recurrence recurrence(AdminOpsCandidateRepository.ProfileRow profile, OffsetDateTime target) {
        if (profile == null) return unavailable("RECURRENCE_PROFILE_MISSING");
        var parsed = parser.parse(profile.payload());
        if (!parsed.valid()) return unavailable("RECURRENCE_PROFILE_INVALID");
        var local = target.atZoneSameInstant(SEOUL);
        var cell = parsed.cells().get(new StationRhythmProfileParser.CellKey(local.getDayOfWeek().getValue(), local.getHour()));
        if (cell == null) return unavailable("RECURRENCE_CELL_INSUFFICIENT");
        var stockout = parsed.stockout();
        return new AdminOpsCandidateDtos.Recurrence(true, null, profile.windowStart(), profile.windowEnd(), profile.generatedAt(), cell.sampleCount(), cell.medianBikeCount(), cell.stockoutRate(),
                stockout.episodeCount(), stockout.medianDurationMinutes(), stockout.p90DurationMinutes(), stockout.medianRecoveryMinutesToThree());
    }
    private AdminOpsCandidateDtos.Recurrence unavailable(String code) { return new AdminOpsCandidateDtos.Recurrence(false, code, null, null, null, null, null, null, null, null, null, null); }
    private int afterCursor(List<Ranked> values, Cursor cursor) {
        for (int index = 0; index < values.size(); index++) {
            var candidate = values.get(index).candidate();
            if (candidate.prediction().selectedShortageProbability().compareTo(cursor.selectedProbability()) == 0
                    && candidate.prediction().predictionTargetAt().equals(cursor.predictionTargetAt()) && candidate.station().stationNumber().equals(cursor.stationNumber())) return index + 1;
        }
        throw new IllegalArgumentException("invalid cursor");
    }
    private String encode(AdminOpsCandidateDtos.Candidate candidate, OffsetDateTime reference, int horizon, int required, String riskType) {
        String raw = String.join("|", reference.toString(), candidate.prediction().selectedShortageProbability().toPlainString(), candidate.prediction().predictionTargetAt().toString(), candidate.station().stationNumber(), String.valueOf(horizon), String.valueOf(required), riskType);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    private Cursor decode(String value, int horizon, int required, String riskType) {
        if (value == null || value.isBlank()) return null;
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), java.nio.charset.StandardCharsets.UTF_8).split("\\|", -1);
            if (parts.length != 7 || horizon != Integer.parseInt(parts[4]) || required != Integer.parseInt(parts[5]) || !riskType.equals(parts[6])) throw new IllegalArgumentException("invalid cursor");
            return new Cursor(OffsetDateTime.parse(parts[0]), new BigDecimal(parts[1]), OffsetDateTime.parse(parts[2]), parts[3]);
        } catch (RuntimeException error) { throw new IllegalArgumentException("invalid cursor"); }
    }
    private AdminOpsDtos.Capabilities capabilities() { return new AdminOpsDtos.Capabilities(new AdminOpsDtos.Capability(true, "station_predictions + prediction_batches", null), new AdminOpsDtos.Capability(false, null, "RETURN_INFERENCE_NOT_APPROVED"), new AdminOpsDtos.Capability(false, null, "CAPACITY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "DISTRICT_SOURCE_MISSING"), new AdminOpsDtos.Capability(true, "station_rhythm_profiles", null), new AdminOpsDtos.Capability(false, null, "USAGE_HISTORY_SOURCE_MISSING"), new AdminOpsDtos.Capability(false, null, "ALTERNATIVE_RULE_NOT_APPROVED")); }
    private List<String> limitations(List<AdminOpsReadRepository.Row> rows, List<AdminOpsReadRepository.Row> eligible) { List<String> result = new ArrayList<>(); if (readRepository.activePublicStationCount() == 0) result.add("NO_ACTIVE_PUBLIC_STATIONS"); if (!rows.isEmpty() && eligible.isEmpty()) result.add("NO_ELIGIBLE_CANDIDATES"); if (readRepository.activeStationsWithoutPublicNumber() > 0) result.add("STATION_NUMBER_MISSING"); return result; }
    private String aggregate(List<AdminOpsReadRepository.Row> rows) { if (rows.stream().anyMatch(row -> "UNAVAILABLE".equals(row.dataState()))) return "UNAVAILABLE"; if (rows.stream().anyMatch(row -> "MISSING".equals(row.dataState()))) return "MISSING"; if (rows.stream().anyMatch(row -> "DELAYED".equals(row.dataState()))) return "DELAYED"; if (rows.stream().anyMatch(row -> "INSUFFICIENT_DATA".equals(row.dataState()))) return "INSUFFICIENT_DATA"; return "NORMAL"; }
    private record Ranked(AdminOpsCandidateDtos.Candidate candidate, long rank) { }
    private record Cursor(OffsetDateTime referenceTime, BigDecimal selectedProbability, OffsetDateTime predictionTargetAt, String stationNumber) { }
}
