package com.ddarungflow.admin.data;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;

@Repository
public class AdminDataPipelineRepository {
    private final JdbcTemplate jdbc;

    public AdminDataPipelineRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public PipelineRun latestRun() {
        return jdbc.query("""
                SELECT run_id, status, failure_stage, reason_code, started_at, completed_at,
                       source_collected_at, source_count, validated_count, published_count,
                       normal_count, missing_count
                FROM admin_data_pipeline_runs
                WHERE pipeline_key = 'CURRENT_INVENTORY'
                ORDER BY completed_at DESC, run_id DESC
                LIMIT 1
                """, (rs, rowNum) -> map(rs)).stream().findFirst().orElse(null);
    }

    private PipelineRun map(ResultSet rs) throws SQLException {
        return new PipelineRun(
                rs.getString("run_id"),
                rs.getString("status"),
                rs.getString("failure_stage"),
                rs.getString("reason_code"),
                rs.getObject("started_at", OffsetDateTime.class),
                rs.getObject("completed_at", OffsetDateTime.class),
                rs.getObject("source_collected_at", OffsetDateTime.class),
                nullableLong(rs, "source_count"),
                nullableLong(rs, "validated_count"),
                nullableLong(rs, "published_count"),
                nullableLong(rs, "normal_count"),
                nullableLong(rs, "missing_count"));
    }

    private Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    public record PipelineRun(
            String runId,
            String status,
            String failureStage,
            String reasonCode,
            OffsetDateTime startedAt,
            OffsetDateTime completedAt,
            OffsetDateTime sourceCollectedAt,
            Long sourceCount,
            Long validatedCount,
            Long publishedCount,
            Long normalCount,
            Long missingCount) {
    }
}
