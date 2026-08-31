package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class AdminOpsDataStatusDtos {
    private AdminOpsDataStatusDtos() { }

    public record Response(OffsetDateTime referenceTime, OffsetDateTime generatedAt, String dataState,
                           Inventory inventory, Prediction prediction, Profile profile, List<String> limitations) { }

    public record Inventory(String dataState, long expectedStationCount, long latestStationCount,
                            long missingStationCount, OffsetDateTime latestCollectedAt,
                            Long p50DelayMinutes, Long p95DelayMinutes,
                            Map<String, Long> inventoryStatusBreakdown) { }

    public record Prediction(String dataState, OffsetDateTime featureAsOf, OffsetDateTime generatedAt,
                             OffsetDateTime publishedAt, OffsetDateTime expiresAt,
                             long predictedStationCount, long predictionRowCount, BigDecimal coverageRatio) { }

    public record Profile(String dataState, long activePublicStationCount,
                          long profileAvailableStationCount, BigDecimal coverageRatio,
                          OffsetDateTime latestGeneratedAt) { }
}
