package com.ddarungflow.admin.operations;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;

@Repository
public class AdminOpsReadRepository {
    private final JdbcTemplate jdbc;

    public AdminOpsReadRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Row> findRows(OffsetDateTime referenceTime, int horizonMinutes, BigDecimal minLng, BigDecimal minLat,
                              BigDecimal maxLng, BigDecimal maxLat, String requestedDataState) {
        return queryRows(referenceTime, horizonMinutes, minLng, minLat, maxLng, maxLat, requestedDataState, null);
    }

    public Row findDetail(OffsetDateTime referenceTime, int horizonMinutes, String stationNumber) {
        return queryRows(referenceTime, horizonMinutes, null, null, null, null, null, stationNumber).stream()
                .findFirst().orElse(null);
    }

    private List<Row> queryRows(OffsetDateTime referenceTime, int horizonMinutes, BigDecimal minLng, BigDecimal minLat,
                                BigDecimal maxLng, BigDecimal maxLat, String requestedDataState, String stationNumber) {
        OffsetDateTime normalSince = referenceTime.minusMinutes(30);
        OffsetDateTime delayedSince = referenceTime.minusMinutes(180);
        return jdbc.query("""
                WITH ranked_predictions AS (
                    SELECT sp.id, sp.station_id, sp.prediction_target_at,
                           sp.at_least_1_probability, sp.at_least_2_probability, sp.at_least_3_probability,
                           sp.at_least_4_probability, sp.at_least_5_probability,
                           ROW_NUMBER() OVER (PARTITION BY sp.station_id ORDER BY sp.prediction_target_at ASC,
                               b.feature_as_of DESC, b.generated_at DESC, sp.id DESC) AS row_number
                    FROM station_predictions sp
                    JOIN prediction_batches b ON b.batch_id = sp.batch_id
                    WHERE b.publish_status = 'ACTIVE' AND b.generated_at <= ? AND b.expires_at > ?
                      AND sp.horizon_minutes = ? AND sp.prediction_target_at >= ?
                ), station_rows AS (
                    SELECT s.station_number, s.name, s.latitude, s.longitude,
                           i.available_bike_count, i.collected_at, i.inventory_status,
                           p.id AS prediction_id, p.prediction_target_at,
                           p.at_least_1_probability, p.at_least_2_probability, p.at_least_3_probability,
                           p.at_least_4_probability, p.at_least_5_probability,
                           CASE
                               WHEN i.inventory_status = 'UNAVAILABLE' THEN 'UNAVAILABLE'
                               WHEN i.station_id IS NULL OR i.collected_at IS NULL OR i.inventory_status = 'MISSING' THEN 'MISSING'
                               WHEN i.inventory_status = 'DELAYED' THEN 'DELAYED'
                               WHEN i.collected_at >= ? THEN 'NORMAL'
                               WHEN i.collected_at >= ? THEN 'DELAYED'
                               ELSE 'MISSING'
                           END AS inventory_data_state
                    FROM stations s
                    LEFT JOIN station_inventory_current i ON i.station_id = s.station_id
                    LEFT JOIN ranked_predictions p ON p.station_id = s.station_id AND p.row_number = 1
                    WHERE s.active = TRUE AND s.station_number IS NOT NULL
                      AND (? IS NULL OR s.station_number = ?)
                      AND (? IS NULL OR s.longitude BETWEEN ? AND ?)
                      AND (? IS NULL OR s.latitude BETWEEN ? AND ?)
                ), resolved AS (
                    SELECT *, CASE WHEN inventory_data_state = 'NORMAL' AND prediction_id IS NULL
                                    THEN 'INSUFFICIENT_DATA' ELSE inventory_data_state END AS data_state
                    FROM station_rows
                )
                SELECT * FROM resolved
                WHERE (? IS NULL OR data_state = ?)
                ORDER BY CASE WHEN prediction_id IS NULL THEN 1 ELSE 0 END,
                         (1 - at_least_1_probability) DESC, station_number ASC
                """, (rs, ignored) -> map(rs), referenceTime, referenceTime, horizonMinutes, referenceTime,
                normalSince, delayedSince, stationNumber, stationNumber, minLng, minLng, maxLng, minLat, minLat, maxLat,
                requestedDataState, requestedDataState);
    }

    public CoverageRow coverage(OffsetDateTime referenceTime, int horizonMinutes) {
        Long active = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE", Long.class);
        Long inventory = jdbc.queryForObject("SELECT COUNT(*) FROM stations s JOIN station_inventory_current i ON i.station_id = s.station_id WHERE s.active = TRUE", Long.class);
        Long prediction = jdbc.queryForObject("""
                SELECT COUNT(DISTINCT sp.station_id) FROM station_predictions sp JOIN prediction_batches b ON b.batch_id = sp.batch_id
                JOIN stations s ON s.station_id = sp.station_id WHERE s.active = TRUE AND b.publish_status = 'ACTIVE'
                AND b.generated_at <= ? AND b.expires_at > ? AND sp.horizon_minutes = ? AND sp.prediction_target_at >= ?
                """, Long.class, referenceTime, referenceTime, horizonMinutes, referenceTime);
        Long profiles = jdbc.queryForObject("SELECT COUNT(*) FROM station_rhythm_profiles p JOIN stations s ON s.station_id = p.station_id WHERE s.active = TRUE", Long.class);
        return new CoverageRow(active, inventory, prediction, profiles);
    }

    private Row map(ResultSet rs) throws SQLException {
        return new Row(rs.getString("station_number"), rs.getString("name"), rs.getBigDecimal("latitude"),
                rs.getBigDecimal("longitude"), (Integer) rs.getObject("available_bike_count"),
                rs.getObject("prediction_target_at", OffsetDateTime.class), rs.getString("inventory_data_state"), rs.getString("data_state"),
                rs.getObject("at_least_1_probability", BigDecimal.class), rs.getObject("at_least_2_probability", BigDecimal.class),
                rs.getObject("at_least_3_probability", BigDecimal.class), rs.getObject("at_least_4_probability", BigDecimal.class),
                rs.getObject("at_least_5_probability", BigDecimal.class));
    }

    public record Row(String stationNumber, String name, BigDecimal latitude, BigDecimal longitude, Integer currentBikes,
                      OffsetDateTime predictionTargetAt, String inventoryDataState, String dataState, BigDecimal atLeast1, BigDecimal atLeast2,
                      BigDecimal atLeast3, BigDecimal atLeast4, BigDecimal atLeast5) { }
    public record CoverageRow(Long activeStationCount, Long inventoryAvailableCount, Long predictionAvailableCount,
                              Long profileAvailableCount) { }

    public long activeStationsWithoutPublicNumber() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE AND station_number IS NULL", Long.class);
        return count == null ? 0 : count;
    }

    public long activePublicStationCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE AND station_number IS NOT NULL", Long.class);
        return count == null ? 0 : count;
    }
}
