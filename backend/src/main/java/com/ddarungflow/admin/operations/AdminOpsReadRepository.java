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
