package com.ddarungflow.inventory;

import java.time.OffsetDateTime;

public record InventoryResult(
    String stationId,
    Integer availableBikeCount,
    OffsetDateTime collectedAt,
    InventoryStatus status
) {
}
