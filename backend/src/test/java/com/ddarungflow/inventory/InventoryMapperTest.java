package com.ddarungflow.inventory;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class InventoryMapperTest {

    private final InventoryMapper mapper = new InventoryMapper();

    @Test
    @DisplayName("3대와 수집시각이 그대로 유지되고 NORMAL")
    void mapsNormalInventory() {
        // given
        String stationId = "ST-4";
        Integer availableBikeCount = 3;
        OffsetDateTime collectedAt = OffsetDateTime.parse("2026-08-12T10:00:00+09:00");

        // when
        InventoryResult result = mapper.map(stationId, availableBikeCount, collectedAt, true, false);

        // then
        assertThat(result.stationId()).isEqualTo(stationId);
        assertThat(result.availableBikeCount()).isEqualTo(3);
        assertThat(result.collectedAt()).isEqualTo(collectedAt);
        assertThat(result.status()).isEqualTo(InventoryStatus.NORMAL);
    }

    @Test
    @DisplayName("0대가 MISSING으로 바뀌지 않고 NORMAL")
    void keepsZeroAsNormalInventory() {
        // given
        String stationId = "ST-4";
        Integer availableBikeCount = 0;
        OffsetDateTime collectedAt = OffsetDateTime.parse("2026-08-12T10:00:00+09:00");

        // when
        InventoryResult result = mapper.map(stationId, availableBikeCount, collectedAt, true, false);

        // then
        assertThat(result.availableBikeCount()).isEqualTo(0);
        assertThat(result.status()).isEqualTo(InventoryStatus.NORMAL);
    }

    @Test
    @DisplayName("비정상/지연/누락 상태를 적절히 구분한다 (DELAYED, MISSING, UNAVAILABLE)")
    void distinguishesNonNormalStates() {
        String stationId = "ST-4";
        OffsetDateTime collectedAt = OffsetDateTime.parse("2026-08-12T10:00:00+09:00");

        // 1. 완전한 값 + delayed=true -> DELAYED
        InventoryResult delayedResult = mapper.map(stationId, 3, collectedAt, true, true);
        assertThat(delayedResult.status()).isEqualTo(InventoryStatus.DELAYED);

        // 2. 자전거 수 null -> MISSING
        InventoryResult missingResult = mapper.map(stationId, null, collectedAt, true, false);
        assertThat(missingResult.status()).isEqualTo(InventoryStatus.MISSING);

        // 3. sourceAvailable=false -> UNAVAILABLE
        InventoryResult unavailableResult = mapper.map(stationId, 3, collectedAt, false, false);
        assertThat(unavailableResult.status()).isEqualTo(InventoryStatus.UNAVAILABLE);
    }
}
