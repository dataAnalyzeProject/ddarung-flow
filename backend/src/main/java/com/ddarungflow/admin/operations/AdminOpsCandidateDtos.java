package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class AdminOpsCandidateDtos {
    private AdminOpsCandidateDtos() { }
    public record Coverage(long activePublicStationCount, long inventoryAvailableCount, long predictionAvailableCount, long profileAvailableCount, long eligibleCandidateCount) { }
    public record Prediction(OffsetDateTime predictionTargetAt, int selectedRequiredBikeCount, BigDecimal selectedShortageProbability) { }
    public record Factor(Object value, String role) { }
    public record RankingFactors(Factor severity, Factor imminence, String recurrence, String dataQuality) { }
    public record Recurrence(boolean available, String reasonCode, LocalDate windowStart, LocalDate windowEnd, OffsetDateTime profileGeneratedAt,
                             Long sampleCount, BigDecimal medianBikeCount, BigDecimal observedStockoutRate, Long episodeCount,
                             BigDecimal medianDurationMinutes, BigDecimal p90DurationMinutes, BigDecimal medianRecoveryMinutesToThree) { }
    public record Candidate(long rank, String ruleVersion, AdminOpsDtos.Station station, Prediction prediction, RankingFactors rankingFactors,
                            Recurrence recurrence, String dataState) { }
    public record Response(OffsetDateTime referenceTime, OffsetDateTime generatedAt, int horizonMinutes, int requiredBikeCount, String riskType,
                           AdminOpsDtos.Capabilities capabilities, String dataState, Coverage coverage, List<String> limitations,
                           List<Candidate> items, String nextCursor) { }
}
