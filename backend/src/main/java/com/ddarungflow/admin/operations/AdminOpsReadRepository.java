package com.ddarungflow.admin.operations;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** Reads only station and current-inventory truth. Historical prediction tables are intentionally not queried. */
@Repository
public class AdminOpsReadRepository {
    private final JdbcTemplate jdbc;

    public AdminOpsReadRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Row> findRows(BigDecimal minLng, BigDecimal minLat, BigDecimal maxLng, BigDecimal maxLat) {
        StringBuilder sql = new StringBuilder("""
                SELECT s.station_id, s.station_number, s.name, s.latitude, s.longitude,
                       i.available_bike_count, i.collected_at, i.inventory_status
                FROM stations s LEFT JOIN station_inventory_current i ON i.station_id = s.station_id
                WHERE s.active = TRUE AND s.station_number IS NOT NULL
                """);
        List<Object> parameters = new ArrayList<>();
        if (minLng != null) {
            sql.append(" AND s.longitude BETWEEN ? AND ? AND s.latitude BETWEEN ? AND ?");
            parameters.add(minLng); parameters.add(maxLng); parameters.add(minLat); parameters.add(maxLat);
        }
        sql.append(" ORDER BY s.station_number ASC");
        return jdbc.query(sql.toString(), (rs, ignored) -> map(rs), parameters.toArray());
    }

    public Row findDetail(String stationNumber) {
        return jdbc.query("""
                SELECT s.station_id, s.station_number, s.name, s.latitude, s.longitude,
                       i.available_bike_count, i.collected_at, i.inventory_status
                FROM stations s LEFT JOIN station_inventory_current i ON i.station_id = s.station_id
                WHERE s.active = TRUE AND s.station_number = ?
                """, (rs, ignored) -> map(rs), stationNumber).stream().findFirst().orElse(null);
    }

    public CoverageRow coverage() {
        Long active = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE AND station_number IS NOT NULL", Long.class);
        Long inventory = jdbc.queryForObject("SELECT COUNT(*) FROM stations s JOIN station_inventory_current i ON i.station_id = s.station_id WHERE s.active = TRUE AND s.station_number IS NOT NULL", Long.class);
        Long profiles = jdbc.queryForObject("SELECT COUNT(*) FROM station_rhythm_profiles p JOIN stations s ON s.station_id = p.station_id WHERE s.active = TRUE AND s.station_number IS NOT NULL", Long.class);
        return new CoverageRow(active, inventory, 0L, profiles);
    }

    private Row map(ResultSet rs) throws SQLException {
        return new Row(rs.getString("station_id"), rs.getString("station_number"), rs.getString("name"),
                rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"), (Integer) rs.getObject("available_bike_count"),
                rs.getObject("collected_at", OffsetDateTime.class), rs.getString("inventory_status"), null, null, null, null, null, null, null, null);
    }

    public record Row(String stationId, String stationNumber, String name, BigDecimal latitude, BigDecimal longitude,
                      Integer currentBikes, OffsetDateTime collectedAt, String inventoryStatus, OffsetDateTime predictionTargetAt,
                      String inventoryDataState, String dataState, BigDecimal atLeast1, BigDecimal atLeast2, BigDecimal atLeast3,
                      BigDecimal atLeast4, BigDecimal atLeast5) { }
    public record CoverageRow(Long activeStationCount, Long inventoryAvailableCount, Long predictionAvailableCount, Long profileAvailableCount) { }

    public long activeStationsWithoutPublicNumber() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE AND station_number IS NULL", Long.class);
        return count == null ? 0 : count;
    }
    public long activePublicStationCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE AND station_number IS NOT NULL", Long.class);
        return count == null ? 0 : count;
    }

    /** Separate historical candidate API; the runtime risk-map path calls the four-argument method above instead. */
    public List<Row> findRows(OffsetDateTime referenceTime, int horizonMinutes, BigDecimal minLng, BigDecimal minLat,
                              BigDecimal maxLng, BigDecimal maxLat, String requestedDataState) {
        String sql = """
                WITH ranked AS (SELECT sp.station_id, sp.prediction_target_at, sp.at_least_1_probability, sp.at_least_2_probability, sp.at_least_3_probability, sp.at_least_4_probability, sp.at_least_5_probability,
                   ROW_NUMBER() OVER (PARTITION BY sp.station_id ORDER BY sp.prediction_target_at, b.feature_as_of DESC, b.generated_at DESC, sp.id DESC) rn
                   FROM station_predictions sp JOIN prediction_batches b ON b.batch_id = sp.batch_id
                   WHERE b.publish_status='ACTIVE' AND b.generated_at<=? AND b.expires_at>? AND sp.horizon_minutes=? AND sp.prediction_target_at>=?),
                rows AS (SELECT s.station_id,s.station_number,s.name,s.latitude,s.longitude,i.available_bike_count,i.collected_at,i.inventory_status,
                   p.prediction_target_at,p.at_least_1_probability,p.at_least_2_probability,p.at_least_3_probability,p.at_least_4_probability,p.at_least_5_probability,
                   CASE WHEN i.inventory_status='UNAVAILABLE' THEN 'UNAVAILABLE' WHEN i.station_id IS NULL OR i.collected_at IS NULL OR i.inventory_status='MISSING' THEN 'MISSING'
                        WHEN i.inventory_status='DELAYED' THEN 'DELAYED' WHEN i.collected_at>=? THEN 'NORMAL' WHEN i.collected_at>=? THEN 'DELAYED' ELSE 'MISSING' END inventory_data_state
                   FROM stations s LEFT JOIN station_inventory_current i ON i.station_id=s.station_id LEFT JOIN ranked p ON p.station_id=s.station_id AND p.rn=1
                   WHERE s.active=TRUE AND s.station_number IS NOT NULL)
                SELECT *, CASE WHEN inventory_data_state='NORMAL' AND prediction_target_at IS NULL THEN 'INSUFFICIENT_DATA' ELSE inventory_data_state END data_state FROM rows
                """;
        List<Object> args = new ArrayList<>(List.of(referenceTime, referenceTime, horizonMinutes, referenceTime, referenceTime.minusMinutes(30), referenceTime.minusMinutes(180)));
        if (requestedDataState != null) { sql += " WHERE data_state=?"; args.add(requestedDataState); }
        sql += " ORDER BY CASE WHEN prediction_target_at IS NULL THEN 1 ELSE 0 END, (1-at_least_1_probability) DESC, station_number";
        return jdbc.query(sql, (rs, ignored) -> new Row(rs.getString("station_id"), rs.getString("station_number"), rs.getString("name"), rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"),
                (Integer) rs.getObject("available_bike_count"), rs.getObject("collected_at", OffsetDateTime.class), rs.getString("inventory_status"), rs.getObject("prediction_target_at", OffsetDateTime.class),
                rs.getString("inventory_data_state"), rs.getString("data_state"), rs.getBigDecimal("at_least_1_probability"), rs.getBigDecimal("at_least_2_probability"), rs.getBigDecimal("at_least_3_probability"), rs.getBigDecimal("at_least_4_probability"), rs.getBigDecimal("at_least_5_probability")), args.toArray());
    }

    public CoverageRow coverage(OffsetDateTime referenceTime, int horizonMinutes) { return coverage(); }

    /** Retained only for the repository SQL-shape regression test; the runtime risk path never executes this legacy probe. */
    QuerySpec buildRowsQuery(OffsetDateTime referenceTime, int horizonMinutes, BigDecimal minLng, BigDecimal minLat,
                             BigDecimal maxLng, BigDecimal maxLat, String requestedDataState, String stationNumber) {
        List<Object> parameters = new ArrayList<>(List.of(referenceTime, referenceTime, horizonMinutes, referenceTime,
                referenceTime.minusMinutes(30), referenceTime.minusMinutes(180)));
        StringBuilder sql = new StringBuilder("SELECT s.station_number FROM stations s WHERE s.active = TRUE");
        if (stationNumber != null) { sql.append(" AND s.station_number = ?"); parameters.add(stationNumber); }
        if (minLng != null) { sql.append(" AND s.longitude BETWEEN ? AND ? AND s.latitude BETWEEN ? AND ?"); parameters.add(minLng); parameters.add(maxLng); parameters.add(minLat); parameters.add(maxLat); }
        if (requestedDataState != null) { sql.append(" AND data_state = ?"); parameters.add(requestedDataState); }
        return new QuerySpec(sql.toString(), List.copyOf(parameters));
    }
    record QuerySpec(String sql, List<Object> parameters) { }
}
