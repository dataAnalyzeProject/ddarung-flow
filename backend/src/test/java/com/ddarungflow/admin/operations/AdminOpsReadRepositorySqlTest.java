package com.ddarungflow.admin.operations;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class AdminOpsReadRepositorySqlTest {
    private final AdminOpsReadRepository repository = new AdminOpsReadRepository(null);
    private final OffsetDateTime referenceTime = OffsetDateTime.parse("2026-08-30T00:00:00Z");

    @Test
    void omitsOptionalPredicatesAndNullArgumentsWhenUnfiltered() {
        AdminOpsReadRepository.QuerySpec query = query(null, null, null, null, null, null);

        assertThat(query.sql()).doesNotContain("? IS NULL");
        assertThat(query.parameters()).hasSize(6).doesNotContainNull();
    }

    @Test
    void appendsStationNumberPredicateAndArgumentOnce() {
        AdminOpsReadRepository.QuerySpec query = query(null, null, null, null, null, "1001");

        assertThat(query.sql()).contains("s.station_number = ?");
        assertThat(query.parameters()).hasSize(7).containsExactly(referenceTime, referenceTime, 60,
                referenceTime, referenceTime.minusMinutes(30), referenceTime.minusMinutes(180), "1001");
    }

    @Test
    void appendsBboxAndDataStatePredicatesWithMatchingArguments() {
        BigDecimal minLng = new BigDecimal("126.9");
        BigDecimal maxLng = new BigDecimal("127.1");
        BigDecimal minLat = new BigDecimal("37.4");
        BigDecimal maxLat = new BigDecimal("37.6");
        AdminOpsReadRepository.QuerySpec query = query(minLng, minLat, maxLng, maxLat, "DELAYED", null);

        assertThat(query.sql()).contains("s.longitude BETWEEN ? AND ?", "s.latitude BETWEEN ? AND ?", "data_state = ?");
        assertThat(query.parameters()).hasSize(11).containsExactly(referenceTime, referenceTime, 60, referenceTime,
                referenceTime.minusMinutes(30), referenceTime.minusMinutes(180), minLng, maxLng, minLat, maxLat, "DELAYED");
    }

    private AdminOpsReadRepository.QuerySpec query(BigDecimal minLng, BigDecimal minLat, BigDecimal maxLng,
                                                    BigDecimal maxLat, String dataState, String stationNumber) {
        return repository.buildRowsQuery(referenceTime, 60, minLng, minLat, maxLng, maxLat, dataState, stationNumber);
    }
}
