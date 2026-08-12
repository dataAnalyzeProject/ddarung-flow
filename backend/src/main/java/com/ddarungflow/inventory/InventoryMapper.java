package com.ddarungflow.inventory;

import java.time.OffsetDateTime;

public class InventoryMapper {

    public InventoryResult map(
        String stationId,
        Integer availableBikeCount,
        OffsetDateTime collectedAt,
        boolean sourceAvailable,
        boolean delayed
    ) {
        if (stationId == null || stationId.isBlank()) {
            throw new IllegalArgumentException("stationId cannot be null or blank");
        }
        if (availableBikeCount != null && availableBikeCount < 0) {
            throw new IllegalArgumentException("availableBikeCount cannot be negative");
        }
        if (!sourceAvailable) {
            return new InventoryResult(stationId, availableBikeCount, collectedAt, InventoryStatus.UNAVAILABLE);
        }
        if (availableBikeCount == null || collectedAt == null) {
            return new InventoryResult(stationId, availableBikeCount, collectedAt, InventoryStatus.MISSING);
        }
        if (delayed) {
            return new InventoryResult(stationId, availableBikeCount, collectedAt, InventoryStatus.DELAYED);
        }
        return new InventoryResult(stationId, availableBikeCount, collectedAt, InventoryStatus.NORMAL);
    }
}
