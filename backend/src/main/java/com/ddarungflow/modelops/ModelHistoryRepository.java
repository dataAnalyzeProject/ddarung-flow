package com.ddarungflow.modelops;

import com.ddarungflow.dto.ModelOpsDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class ModelHistoryRepository {
    private final JdbcTemplate jdbcTemplate;

    public ModelHistoryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ModelOpsDtos.HistoryResponse> findRecent() {
        return jdbcTemplate.query("""
                SELECT action, target_type, target_id, result, reason_code, occurred_at
                  FROM audit_events
                 WHERE target_type IN ('MODEL', 'MODEL_UPLOAD')
                   AND SUBSTRING(action, 1, 6) = 'MODEL_'
                 ORDER BY occurred_at DESC, id DESC
                 LIMIT 100
                """, (resultSet, rowNumber) -> new ModelOpsDtos.HistoryResponse(
                resultSet.getString("action"), resultSet.getString("target_type"),
                resultSet.getString("target_id"), resultSet.getString("result"),
                resultSet.getString("reason_code"), resultSet.getObject("occurred_at", java.time.OffsetDateTime.class)));
    }
}
