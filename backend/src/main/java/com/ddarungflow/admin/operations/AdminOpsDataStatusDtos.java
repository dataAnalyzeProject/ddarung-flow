package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class AdminOpsDataStatusDtos {
    private AdminOpsDataStatusDtos() { }

    public record Response(OffsetDateTime referenceTime, OffsetDateTime generatedAt, String dataState,
                           Inventory inventory, Prediction prediction, RuntimeAnalysis runtimeAnalysis,
                           Profile profile, List<String> limitations) { }

    public record Inventory(String dataState, long expectedStationCount, long latestStationCount,
                            long missingStationCount, OffsetDateTime latestCollectedAt,
                            Long p50DelayMinutes, Long p95DelayMinutes,
                            Map<String, Long> inventoryStatusBreakdown) { }

    /**
     * Historical prediction-batch record only. Retained for operators who still want to see the
     * legacy batch pipeline's last publish, but its absence no longer drives {@code dataState} at
     * the root — current operational risk-serving health is {@link RuntimeAnalysis}, not this.
     */
    public record Prediction(String dataState, OffsetDateTime featureAsOf, OffsetDateTime generatedAt,
                             OffsetDateTime publishedAt, OffsetDateTime expiresAt,
                             long predictedStationCount, long predictionRowCount, BigDecimal coverageRatio) { }

    /**
     * The current on-demand risk-serving path (OPS-01/OPS-02/OPS-03's shared
     * {@code admin_ops_runtime_risk_snapshots}), reported independently of the legacy batch.
     * {@code hasRecentSnapshot=false} means no analysis has been run yet — not that the runtime is
     * down. {@code snapshotExpired=true} means one was run but its 2-minute TTL has since passed.
     * The scope/count fields describe only that one bounded analysis, never citywide coverage.
     */
    public record RuntimeAnalysis(String dataState, boolean hasRecentSnapshot, boolean snapshotExpired,
                                  OffsetDateTime referenceTime, OffsetDateTime createdAt, OffsetDateTime expiresAt,
                                  Integer horizonMinutes, Integer requiredBikeCount,
                                  Integer eligibleStationCount, Integer evaluatedStationCount,
                                  Integer normalInferenceSuccessCount) { }

    public record Profile(String dataState, long activePublicStationCount,
                          long profileAvailableStationCount, BigDecimal coverageRatio,
                          OffsetDateTime latestGeneratedAt) { }
}
