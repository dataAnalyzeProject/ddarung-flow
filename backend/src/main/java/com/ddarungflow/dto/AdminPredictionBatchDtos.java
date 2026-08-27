package com.ddarungflow.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AdminPredictionBatchDtos {
    private AdminPredictionBatchDtos() { }

    public record Response(Summary summary, List<Batch> batches, OffsetDateTime generatedAt) { }
    public record Summary(long totalBatches, long activeBatchCount, OffsetDateTime latestFeatureAsOf,
                          Long latestPublishLagSeconds, long expectedStationCount) { }
    public record Batch(UUID batchId, String modelVersion, String publishStatus, OffsetDateTime featureAsOf,
                        OffsetDateTime generatedAt, OffsetDateTime publishedAt, OffsetDateTime expiresAt,
                        Long publishLagSeconds, long stationCount, long rowCount, Double coverageRatio,
                        Map<String, Long> horizonCounts, boolean expired) { }
}
