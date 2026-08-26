package com.ddarungflow.dto;

import java.time.OffsetDateTime;
import java.util.Map;

public final class AdminDataQualityDtos {
    private AdminDataQualityDtos() { }

    public record Response(Collection collection, Freshness freshness, Map<String, Long> inventoryStatusBreakdown, OffsetDateTime generatedAt) { }
    public record Collection(int windowHours, long expectedStationCount, long latestStationCount, long missingStationCount, OffsetDateTime latestCollectedAt) { }
    public record Freshness(Long p50DelayMinutes, Long p95DelayMinutes, String status) { }
}
