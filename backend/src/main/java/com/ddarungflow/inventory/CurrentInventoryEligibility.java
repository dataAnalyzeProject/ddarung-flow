package com.ddarungflow.inventory;

import java.time.Duration;
import java.time.OffsetDateTime;

/** Shared current-inventory truth used before any on-demand inference. */
public final class CurrentInventoryEligibility {
    public static final Duration MAX_NORMAL_AGE = Duration.ofMinutes(10);

    private CurrentInventoryEligibility() { }

    public static InventoryStatus status(InventoryStatus stored, OffsetDateTime collectedAt, OffsetDateTime referenceTime) {
        if (stored == null || stored == InventoryStatus.MISSING || collectedAt == null) return InventoryStatus.MISSING;
        if (stored == InventoryStatus.UNAVAILABLE || stored == InventoryStatus.DELAYED) return stored;
        return Duration.between(collectedAt, referenceTime).compareTo(MAX_NORMAL_AGE) > 0
                ? InventoryStatus.DELAYED : InventoryStatus.NORMAL;
    }
}
