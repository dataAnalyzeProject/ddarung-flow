package com.ddarungflow.admin.operations;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class AdminOpsRiskSnapshotRepository {
    private final JdbcTemplate jdbc;
    public AdminOpsRiskSnapshotRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void deleteExpired(OffsetDateTime now) { jdbc.update("DELETE FROM admin_ops_runtime_risk_snapshots WHERE expires_at <= ?", now); }

    public void save(Header header, List<Item> items) {
        jdbc.update("""
                INSERT INTO admin_ops_runtime_risk_snapshots (snapshot_id,created_at,expires_at,reference_time,horizon_minutes,required_bike_count,min_lng,min_lat,max_lng,max_lat,data_state_filter,model_version,eligible_station_count,evaluated_station_count,normal_inference_success_count)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, header.snapshotId(), header.createdAt(), header.expiresAt(), header.referenceTime(), header.horizonMinutes(), header.requiredBikeCount(),
                header.minLng(), header.minLat(), header.maxLng(), header.maxLat(), header.dataStateFilter(), header.modelVersion(),
                header.eligibleStationCount(), header.evaluatedStationCount(), header.normalInferenceSuccessCount());
        for (Item item : items) {
            jdbc.update("""
                    INSERT INTO admin_ops_runtime_risk_snapshot_items (snapshot_id,ordinal,station_number,station_name,latitude,longitude,current_bikes,data_state,at_least_1_probability,at_least_2_probability,at_least_3_probability,at_least_4_probability,at_least_5_probability,selected_shortage_probability,risk_band,prediction_target_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, header.snapshotId(), item.ordinal(), item.stationNumber(), item.stationName(), item.latitude(), item.longitude(), item.currentBikes(), item.dataState(),
                    item.atLeast1(), item.atLeast2(), item.atLeast3(), item.atLeast4(), item.atLeast5(), item.selectedShortage(), item.riskBand(), item.predictionTargetAt());
        }
    }

    public Header findHeader(UUID snapshotId) {
        return jdbc.query("SELECT * FROM admin_ops_runtime_risk_snapshots WHERE snapshot_id = ?", (rs, n) -> new Header(
                rs.getObject("snapshot_id", UUID.class), rs.getObject("created_at", OffsetDateTime.class), rs.getObject("expires_at", OffsetDateTime.class),
                rs.getObject("reference_time", OffsetDateTime.class), rs.getInt("horizon_minutes"), rs.getInt("required_bike_count"),
                rs.getBigDecimal("min_lng"), rs.getBigDecimal("min_lat"), rs.getBigDecimal("max_lng"), rs.getBigDecimal("max_lat"),
                rs.getString("data_state_filter"), rs.getString("model_version"), rs.getInt("eligible_station_count"),
                rs.getInt("evaluated_station_count"), rs.getInt("normal_inference_success_count")), snapshotId).stream().findFirst().orElse(null);
    }

    public List<Item> findPage(UUID snapshotId, int afterOrdinal, int limit) {
        return jdbc.query("SELECT * FROM admin_ops_runtime_risk_snapshot_items WHERE snapshot_id = ? AND ordinal > ? ORDER BY ordinal LIMIT ?", (rs, n) -> item(rs), snapshotId, afterOrdinal, limit);
    }
    public Item findItem(UUID snapshotId, String stationNumber) {
        return jdbc.query("SELECT * FROM admin_ops_runtime_risk_snapshot_items WHERE snapshot_id = ? AND station_number = ?", (rs, n) -> item(rs), snapshotId, stationNumber).stream().findFirst().orElse(null);
    }
    private Item item(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Item(rs.getInt("ordinal"), rs.getString("station_number"), rs.getString("station_name"), rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"),
                (Integer) rs.getObject("current_bikes"), rs.getString("data_state"), rs.getBigDecimal("at_least_1_probability"), rs.getBigDecimal("at_least_2_probability"),
                rs.getBigDecimal("at_least_3_probability"), rs.getBigDecimal("at_least_4_probability"), rs.getBigDecimal("at_least_5_probability"),
                rs.getBigDecimal("selected_shortage_probability"), rs.getString("risk_band"), rs.getObject("prediction_target_at", OffsetDateTime.class));
    }

    public record Header(UUID snapshotId, OffsetDateTime createdAt, OffsetDateTime expiresAt, OffsetDateTime referenceTime,
                         int horizonMinutes, int requiredBikeCount, BigDecimal minLng, BigDecimal minLat, BigDecimal maxLng, BigDecimal maxLat,
                         String dataStateFilter, String modelVersion, int eligibleStationCount, int evaluatedStationCount, int normalInferenceSuccessCount) { }
    public record Item(int ordinal, String stationNumber, String stationName, BigDecimal latitude, BigDecimal longitude, Integer currentBikes,
                       String dataState, BigDecimal atLeast1, BigDecimal atLeast2, BigDecimal atLeast3, BigDecimal atLeast4, BigDecimal atLeast5,
                       BigDecimal selectedShortage, String riskBand, OffsetDateTime predictionTargetAt) { }
}
