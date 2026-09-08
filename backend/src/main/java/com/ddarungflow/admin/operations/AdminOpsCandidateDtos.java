package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class AdminOpsCandidateDtos {
    private AdminOpsCandidateDtos() { }
    /** Global responses expose citywide counts; explicit MAP responses retain scope-local counts. */
    public record Coverage(Long activePublicStationCount, Long analyzedStationCount, Long analysisNormalCount, Long profileAvailableCount,
                           Long eligibleCandidateCount, Long inventoryEligibleCount, Long inventoryMissingCount,
                           Long inventoryDelayedCount, Long inventoryUnavailableCount, Long inferenceInsufficientCount,
                           Long unevaluatedCount) { }
    public record Prediction(OffsetDateTime predictionTargetAt, int selectedRequiredBikeCount, BigDecimal selectedShortageProbability) { }
    public record Factor(Object value, String role) { }
    public record RankingFactors(Factor severity, Factor imminence, String recurrence, String dataQuality) { }
    public record Recurrence(boolean available, String reasonCode, LocalDate windowStart, LocalDate windowEnd, OffsetDateTime profileGeneratedAt,
                             Long sampleCount, BigDecimal medianBikeCount, BigDecimal observedStockoutRate, Long episodeCount,
                             BigDecimal medianDurationMinutes, BigDecimal p90DurationMinutes, BigDecimal medianRecoveryMinutesToThree) { }
    public record Candidate(long rank, String ruleVersion, AdminOpsDtos.Station station, Prediction prediction, RankingFactors rankingFactors,
                            Recurrence recurrence, String dataState) { }
    public record Response(OffsetDateTime referenceTime, OffsetDateTime generatedAt, int horizonMinutes, int requiredBikeCount, String riskType, String ruleVersion,
                           AdminOpsDtos.Capabilities capabilities, String dataState, Coverage coverage, List<String> limitations,
                           List<Candidate> items, String nextCursor, AdminOpsDtos.Scope scope, AdminOpsDtos.Freshness freshness,
                           String generationState, String modelVersion, String globalResultId,
                           OffsetDateTime publishedAt, AdminOpsDtos.GlobalCoverage globalCoverage) { }
}
