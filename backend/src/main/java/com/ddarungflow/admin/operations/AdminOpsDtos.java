package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public final class AdminOpsDtos {
    private AdminOpsDtos() { }

    public record Capability(boolean available, String source, String reasonCode) { }
    public record Capabilities(Capability rentalRisk, Capability returnRisk, Capability stationCapacity,
                               Capability districtMetadata, Capability recurrence, Capability usageScale,
                               Capability nearbyAlternatives) { }
    public record Coverage(Long activeStationCount, Long inventoryAvailableCount, Long predictionAvailableCount,
                           Long profileAvailableCount, Integer eligibleStationCount, Integer evaluatedStationCount,
                           Integer normalInferenceSuccessCount, Integer scopeCandidateCap) { }
    public record Coordinates(BigDecimal latitude, BigDecimal longitude) { }
    public record Probabilities(BigDecimal atLeast1Probability, BigDecimal atLeast2Probability,
                                BigDecimal atLeast3Probability, BigDecimal atLeast4Probability,
                                BigDecimal atLeast5Probability, BigDecimal shortage1Probability,
                                BigDecimal shortage2Probability, BigDecimal shortage3Probability,
                                BigDecimal shortage4Probability, BigDecimal shortage5Probability,
                                Integer selectedRequiredBikeCount, BigDecimal selectedShortageProbability) { }
    public record Station(String stationNumber, String name, Coordinates coordinates, Integer currentBikes,
                          Integer capacity) { }
    public record RiskStation(Station station, OffsetDateTime predictionTargetAt, String dataState,
                              String riskBand, Probabilities rentalRisk) { }
    public record RentalRiskSummary(Integer selectedRequiredBikeCount, long validPredictionCount,
                                    long criticalCount, long highCount, long watchCount, long lowCount,
                                    BigDecimal maxShortageProbability, BigDecimal averageShortageProbability) { }
    public record InventoryStateSummary(long normal, long delayed, long missing, long unavailable) { }
    public record OverviewResponse(OffsetDateTime referenceTime, OffsetDateTime generatedAt, int horizonMinutes,
                                   Capabilities capabilities, String dataState, Coverage coverage,
                                   List<String> limitations, String ruleVersion, RentalRiskSummary rentalRiskSummary,
                                   InventoryStateSummary inventoryStateSummary, Object returnRisk) { }
    public record RiskStationListResponse(OffsetDateTime referenceTime, OffsetDateTime generatedAt, int horizonMinutes,
                                          Capabilities capabilities, String dataState, Coverage coverage,
                                          List<String> limitations, String ruleVersion, List<RiskStation> items,
                                          String nextCursor, String snapshotId) { }
    public record RiskStationDetailResponse(OffsetDateTime referenceTime, OffsetDateTime generatedAt, int horizonMinutes,
                                            Capabilities capabilities, String dataState, Coverage coverage,
                                            List<String> limitations, String ruleVersion, RiskStation station,
                                            Object returnRisk, String snapshotId) { }
    public record ErrorResponse(String code, String message) { }
}
