package com.ddarungflow.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class PredictionBatchRepository {
    private final JdbcTemplate jdbc;

    public PredictionBatchRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public long expectedStationCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM station_inventory_current", Long.class);
        return count == null ? 0 : count;
    }

    public long totalBatchCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM prediction_batches", Long.class);
        return count == null ? 0 : count;
    }

    public long activeBatchCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM prediction_batches WHERE publish_status = 'ACTIVE'", Long.class);
        return count == null ? 0 : count;
    }

    public List<BatchAggregate> findRecentBatchAggregates() {
        return jdbc.query("""
            SELECT b.batch_id, b.model_version, b.publish_status, b.feature_as_of,
                   b.generated_at, b.published_at, b.expires_at,
                   COUNT(DISTINCT sp.station_id) AS station_count, COUNT(sp.id) AS row_count,
                   SUM(CASE WHEN sp.horizon_minutes = 60 THEN 1 ELSE 0 END) AS horizon_60,
                   SUM(CASE WHEN sp.horizon_minutes = 120 THEN 1 ELSE 0 END) AS horizon_120,
                   SUM(CASE WHEN sp.horizon_minutes = 180 THEN 1 ELSE 0 END) AS horizon_180,
                   SUM(CASE WHEN sp.horizon_minutes = 240 THEN 1 ELSE 0 END) AS horizon_240
            FROM prediction_batches b
            LEFT JOIN station_predictions sp ON sp.batch_id = b.batch_id
            GROUP BY b.batch_id, b.model_version, b.publish_status, b.feature_as_of,
                     b.generated_at, b.published_at, b.expires_at
            ORDER BY b.feature_as_of DESC
            LIMIT 20
            """, (resultSet, rowNum) -> mapAggregate(resultSet));
    }

    private BatchAggregate mapAggregate(ResultSet resultSet) throws SQLException {
        return new BatchAggregate(
                resultSet.getObject("batch_id", UUID.class),
                resultSet.getString("model_version"),
                resultSet.getString("publish_status"),
                resultSet.getObject("feature_as_of", OffsetDateTime.class),
                resultSet.getObject("generated_at", OffsetDateTime.class),
                resultSet.getObject("published_at", OffsetDateTime.class),
                resultSet.getObject("expires_at", OffsetDateTime.class),
                resultSet.getLong("station_count"),
                resultSet.getLong("row_count"),
                resultSet.getLong("horizon_60"),
                resultSet.getLong("horizon_120"),
                resultSet.getLong("horizon_180"),
                resultSet.getLong("horizon_240")
        );
    }

    public record BatchAggregate(
            UUID batchId, String modelVersion, String publishStatus, OffsetDateTime featureAsOf,
            OffsetDateTime generatedAt, OffsetDateTime publishedAt, OffsetDateTime expiresAt,
            long stationCount, long rowCount, long horizon60, long horizon120, long horizon180, long horizon240
    ) { }
}
