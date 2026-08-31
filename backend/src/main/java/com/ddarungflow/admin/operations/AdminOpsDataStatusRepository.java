package com.ddarungflow.admin.operations;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class AdminOpsDataStatusRepository {
    private final JdbcTemplate jdbc;

    public AdminOpsDataStatusRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public InventoryCounts inventoryCounts() {
        return jdbc.queryForObject("""
                SELECT COUNT(*) AS expected_station_count,
                       COUNT(i.station_id) AS latest_station_count,
                       MAX(i.collected_at) AS latest_collected_at
                FROM stations s
                LEFT JOIN station_inventory_current i ON i.station_id = s.station_id
                WHERE s.active = TRUE
                """, (rs, row) -> new InventoryCounts(
                rs.getLong("expected_station_count"), rs.getLong("latest_station_count"),
                rs.getObject("latest_collected_at", OffsetDateTime.class)));
    }

    public List<OffsetDateTime> activeCollectedAt() {
        return jdbc.query("""
                SELECT i.collected_at
                FROM stations s JOIN station_inventory_current i ON i.station_id = s.station_id
                WHERE s.active = TRUE AND i.collected_at IS NOT NULL
                """, (rs, row) -> rs.getObject("collected_at", OffsetDateTime.class));
    }

    public List<StatusCount> inventoryStatusCounts() {
        return jdbc.query("""
                SELECT i.inventory_status, COUNT(*) AS status_count
                FROM stations s JOIN station_inventory_current i ON i.station_id = s.station_id
                WHERE s.active = TRUE
                GROUP BY i.inventory_status
                """, (rs, row) -> new StatusCount(rs.getString("inventory_status"), rs.getLong("status_count")));
    }

    public PredictionBatch findNewestValidBatch(OffsetDateTime referenceTime) {
        List<PredictionBatch> batches = jdbc.query("""
                SELECT batch_id, feature_as_of, generated_at, published_at, expires_at
                FROM prediction_batches
                WHERE publish_status = 'ACTIVE' AND generated_at <= ? AND expires_at > ?
                ORDER BY feature_as_of DESC, generated_at DESC, batch_id DESC
                LIMIT 1
                """, (rs, row) -> new PredictionBatch(
                rs.getObject("batch_id", UUID.class), rs.getObject("feature_as_of", OffsetDateTime.class),
                rs.getObject("generated_at", OffsetDateTime.class), rs.getObject("published_at", OffsetDateTime.class),
                rs.getObject("expires_at", OffsetDateTime.class)), referenceTime, referenceTime);
        return batches.isEmpty() ? null : batches.getFirst();
    }

    public PredictionCounts predictionCounts(UUID batchId) {
        return jdbc.queryForObject("""
                SELECT (SELECT COUNT(*) FROM station_predictions WHERE batch_id = ?) AS prediction_row_count,
                       COUNT(DISTINCT sp.station_id) AS predicted_station_count
                FROM stations s
                LEFT JOIN station_predictions sp ON sp.station_id = s.station_id AND sp.batch_id = ?
                WHERE s.active = TRUE
                """, (rs, row) -> new PredictionCounts(rs.getLong("predicted_station_count"), rs.getLong("prediction_row_count")), batchId, batchId);
    }

    public long activeStationCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE", Long.class);
        return count == null ? 0 : count;
    }

    public ProfileCounts profileCounts() {
        return jdbc.queryForObject("""
                SELECT COUNT(*) AS active_public_station_count,
                       COUNT(p.station_id) AS profile_available_station_count,
                       MAX(p.generated_at) AS latest_generated_at
                FROM stations s
                LEFT JOIN station_rhythm_profiles p ON p.station_id = s.station_id
                WHERE s.active = TRUE AND s.station_number IS NOT NULL
                """, (rs, row) -> new ProfileCounts(
                rs.getLong("active_public_station_count"), rs.getLong("profile_available_station_count"),
                rs.getObject("latest_generated_at", OffsetDateTime.class)));
    }

    public record InventoryCounts(long expectedStationCount, long latestStationCount, OffsetDateTime latestCollectedAt) { }
    public record StatusCount(String status, long count) { }
    public record PredictionBatch(UUID batchId, OffsetDateTime featureAsOf, OffsetDateTime generatedAt,
                                  OffsetDateTime publishedAt, OffsetDateTime expiresAt) { }
    public record PredictionCounts(long predictedStationCount, long predictionRowCount) { }
    public record ProfileCounts(long activePublicStationCount, long profileAvailableStationCount,
                                OffsetDateTime latestGeneratedAt) { }
}
