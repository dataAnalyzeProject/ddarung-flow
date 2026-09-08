package com.ddarungflow.admin.operations;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.io.Serializable;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public class AdminOpsGlobalRiskRepository {
    public static final String CONTROL_KEY = "GLOBAL";
    private final JdbcTemplate jdbc;

    public AdminOpsGlobalRiskRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public LeaseAcquisition acquireLease(UUID owner, long leaseMs) {
        ensureControl();
        OffsetDateTime now = databaseNow();
        OffsetDateTime leaseExpiresAt = now.plusNanos(leaseMs * 1_000_000);
        int updated = jdbc.update("""
                UPDATE admin_ops_global_risk_control
                SET lease_owner = ?, lease_started_at = ?, lease_expires_at = ?,
                    latest_attempt_id = ?, latest_attempt_started_at = ?, latest_attempt_finished_at = NULL,
                    latest_attempt_state = 'RUNNING', latest_attempt_reason = NULL, latest_attempt_call_count = 0
                WHERE control_key = ? AND (lease_owner IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
                """, owner, now, leaseExpiresAt, owner, now, CONTROL_KEY);
        return new LeaseAcquisition(updated == 1, now, leaseExpiresAt);
    }

    public void signalMapPriority() {
        ensureControl();
        jdbc.update("UPDATE admin_ops_global_risk_control SET map_priority_requested_at = CURRENT_TIMESTAMP WHERE control_key = ?", CONTROL_KEY);
    }

    public boolean mapPriorityAfter(OffsetDateTime generationStartedAt) {
        Boolean value = jdbc.queryForObject("""
                SELECT CASE WHEN map_priority_requested_at IS NOT NULL AND map_priority_requested_at >= ? THEN TRUE ELSE FALSE END
                FROM admin_ops_global_risk_control WHERE control_key = ?
                """, Boolean.class, generationStartedAt, CONTROL_KEY);
        return Boolean.TRUE.equals(value);
    }

    public boolean leaseOwned(UUID owner) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_ops_global_risk_control
                WHERE control_key = ? AND lease_owner = ? AND lease_expires_at > CURRENT_TIMESTAMP
                """, Integer.class, CONTROL_KEY, owner);
        return count != null && count == 1;
    }

    public void recordFailure(UUID owner, String reason, int callCount) {
        jdbc.update("""
                UPDATE admin_ops_global_risk_control
                SET latest_attempt_finished_at = ?, latest_attempt_state = 'FAILED', latest_attempt_reason = ?,
                    latest_attempt_call_count = ?, lease_owner = NULL, lease_started_at = NULL, lease_expires_at = NULL
                WHERE control_key = ? AND lease_owner = ?
                """, databaseNow(), reason, callCount, CONTROL_KEY, owner);
    }

    public void releaseSkipped(UUID owner, String reason, int callCount) {
        jdbc.update("""
                UPDATE admin_ops_global_risk_control
                SET latest_attempt_finished_at = ?, latest_attempt_state = 'SKIPPED', latest_attempt_reason = ?,
                    latest_attempt_call_count = ?, lease_owner = NULL, lease_started_at = NULL, lease_expires_at = NULL
                WHERE control_key = ? AND lease_owner = ?
                """, databaseNow(), reason, callCount, CONTROL_KEY, owner);
    }

    @Transactional
    public void publish(UUID owner, OffsetDateTime generationStartedAt, Result result, List<Item> items) {
        Control control = lockControl();
        if (!owner.equals(control.leaseOwner()) || control.leaseExpiresAt() == null || !control.leaseExpiresAt().isAfter(databaseNow())) {
            throw new LeaseLostException();
        }
        if (control.mapPriorityRequestedAt() != null && control.mapPriorityRequestedAt().isAfter(generationStartedAt)) {
            throw new MapPriorityException();
        }
        jdbc.update("""
                INSERT INTO admin_ops_global_risk_results
                  (result_id, reference_time, generated_at, published_at, fresh_until, expires_at, model_version,
                   active_public_station_count, inventory_eligible_count, evaluated_count, normal_inference_count,
                   inventory_missing_count, inventory_delayed_count, inventory_unavailable_count,
                   inference_insufficient_count, unevaluated_count, inference_call_count, generation_duration_ms)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, result.resultId(), result.referenceTime(), result.generatedAt(), result.publishedAt(), result.freshUntil(), result.expiresAt(), result.modelVersion(),
                result.activePublicStationCount(), result.inventoryEligibleCount(), result.evaluatedCount(), result.normalInferenceCount(),
                result.inventoryMissingCount(), result.inventoryDelayedCount(), result.inventoryUnavailableCount(), result.inferenceInsufficientCount(),
                result.unevaluatedCount(), result.inferenceCallCount(), result.generationDurationMs());
        List<Object[]> batch = new ArrayList<>(items.size());
        for (Item item : items) batch.add(new Object[] { result.resultId(), item.stationNumber(), item.horizonMinutes(), item.stationName(), item.latitude(), item.longitude(),
                item.currentBikes(), item.inventoryCollectedAt(), item.dataState(), item.atLeast1(), item.atLeast2(), item.atLeast3(), item.atLeast4(), item.atLeast5(), item.predictionTargetAt() });
        jdbc.batchUpdate("""
                INSERT INTO admin_ops_global_risk_items
                  (result_id, station_number, horizon_minutes, station_name, latitude, longitude, current_bikes,
                   inventory_collected_at, data_state, at_least_1_probability, at_least_2_probability,
                   at_least_3_probability, at_least_4_probability, at_least_5_probability, prediction_target_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, batch);
        jdbc.update("""
                UPDATE admin_ops_global_risk_control
                SET previous_result_id = current_result_id, current_result_id = ?,
                    latest_attempt_finished_at = ?, latest_attempt_state = 'SUCCESS', latest_attempt_reason = NULL,
                    latest_attempt_call_count = ?, lease_owner = NULL, lease_started_at = NULL, lease_expires_at = NULL
                WHERE control_key = ? AND lease_owner = ?
                """, result.resultId(), result.publishedAt(), result.inferenceCallCount(), CONTROL_KEY, owner);
        jdbc.update("""
                DELETE FROM admin_ops_global_risk_results
                WHERE result_id NOT IN (
                    SELECT current_result_id FROM admin_ops_global_risk_control WHERE control_key = ? AND current_result_id IS NOT NULL
                    UNION
                    SELECT previous_result_id FROM admin_ops_global_risk_control WHERE control_key = ? AND previous_result_id IS NOT NULL
                )
                """, CONTROL_KEY, CONTROL_KEY);
    }

    public Current current() {
        ensureControl();
        return jdbc.query("""
                SELECT r.*, c.latest_attempt_state, c.latest_attempt_reason, c.latest_attempt_finished_at
                FROM admin_ops_global_risk_control c
                LEFT JOIN admin_ops_global_risk_results r ON r.result_id = c.current_result_id
                WHERE c.control_key = ?
                """, (rs, ignored) -> current(rs), CONTROL_KEY).stream().findFirst().orElse(null);
    }

    public List<Item> items(UUID resultId, int horizonMinutes) {
        return jdbc.query("""
                SELECT * FROM admin_ops_global_risk_items
                WHERE result_id = ? AND horizon_minutes = ? ORDER BY station_number
                """, (rs, ignored) -> item(rs), resultId, horizonMinutes);
    }

    public Result result(UUID resultId) {
        return jdbc.query("SELECT * FROM admin_ops_global_risk_results WHERE result_id = ?", (rs, ignored) -> result(rs), resultId)
                .stream().findFirst().orElse(null);
    }

    public OffsetDateTime databaseNow() {
        return jdbc.queryForObject("SELECT CURRENT_TIMESTAMP", OffsetDateTime.class);
    }

    private Control lockControl() {
        return jdbc.query("SELECT * FROM admin_ops_global_risk_control WHERE control_key = ? FOR UPDATE", (rs, ignored) -> new Control(
                (UUID) rs.getObject("lease_owner"), rs.getObject("lease_expires_at", OffsetDateTime.class),
                rs.getObject("map_priority_requested_at", OffsetDateTime.class)), CONTROL_KEY).getFirst();
    }

    private void ensureControl() {
        jdbc.update("""
                INSERT INTO admin_ops_global_risk_control (control_key)
                SELECT ? WHERE NOT EXISTS (SELECT 1 FROM admin_ops_global_risk_control WHERE control_key = ?)
                """, CONTROL_KEY, CONTROL_KEY);
    }

    private Current current(ResultSet rs) throws SQLException {
        UUID id = (UUID) rs.getObject("result_id");
        Result result = id == null ? null : result(rs);
        return new Current(result, rs.getString("latest_attempt_state"), rs.getString("latest_attempt_reason"), rs.getObject("latest_attempt_finished_at", OffsetDateTime.class));
    }

    private Result result(ResultSet rs) throws SQLException {
        return new Result((UUID) rs.getObject("result_id"), rs.getObject("reference_time", OffsetDateTime.class), rs.getObject("generated_at", OffsetDateTime.class),
                rs.getObject("published_at", OffsetDateTime.class), rs.getObject("fresh_until", OffsetDateTime.class), rs.getObject("expires_at", OffsetDateTime.class),
                rs.getString("model_version"), rs.getInt("active_public_station_count"), rs.getInt("inventory_eligible_count"), rs.getInt("evaluated_count"),
                rs.getInt("normal_inference_count"), rs.getInt("inventory_missing_count"), rs.getInt("inventory_delayed_count"), rs.getInt("inventory_unavailable_count"),
                rs.getInt("inference_insufficient_count"), rs.getInt("unevaluated_count"), rs.getInt("inference_call_count"), rs.getLong("generation_duration_ms"));
    }

    private Item item(ResultSet rs) throws SQLException {
        return new Item(rs.getString("station_number"), rs.getInt("horizon_minutes"), rs.getString("station_name"), rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"),
                (Integer) rs.getObject("current_bikes"), rs.getObject("inventory_collected_at", OffsetDateTime.class), rs.getString("data_state"),
                rs.getBigDecimal("at_least_1_probability"), rs.getBigDecimal("at_least_2_probability"), rs.getBigDecimal("at_least_3_probability"),
                rs.getBigDecimal("at_least_4_probability"), rs.getBigDecimal("at_least_5_probability"), rs.getObject("prediction_target_at", OffsetDateTime.class));
    }

    public record Result(UUID resultId, OffsetDateTime referenceTime, OffsetDateTime generatedAt, OffsetDateTime publishedAt,
                         OffsetDateTime freshUntil, OffsetDateTime expiresAt, String modelVersion,
                         int activePublicStationCount, int inventoryEligibleCount, int evaluatedCount, int normalInferenceCount,
                         int inventoryMissingCount, int inventoryDelayedCount, int inventoryUnavailableCount,
                         int inferenceInsufficientCount, int unevaluatedCount, int inferenceCallCount, long generationDurationMs) { }
    public record Item(String stationNumber, int horizonMinutes, String stationName, BigDecimal latitude, BigDecimal longitude,
                       Integer currentBikes, OffsetDateTime inventoryCollectedAt, String dataState,
                       BigDecimal atLeast1, BigDecimal atLeast2, BigDecimal atLeast3, BigDecimal atLeast4, BigDecimal atLeast5,
                       OffsetDateTime predictionTargetAt) { }
    public record Current(Result result, String latestAttemptState, String latestAttemptReason, OffsetDateTime latestAttemptFinishedAt) { }
    public record LeaseAcquisition(boolean acquired, OffsetDateTime startedAt, OffsetDateTime expiresAt) { }
    private record Control(UUID leaseOwner, OffsetDateTime leaseExpiresAt, OffsetDateTime mapPriorityRequestedAt) { }
    public static class LeaseLostException extends RuntimeException { }
    public static class MapPriorityException extends RuntimeException { }
}

/** JPA schema models keep test databases aligned with the V14 Flyway migration. */
@Entity
@Table(name = "admin_ops_global_risk_results")
class AdminOpsGlobalRiskResult {
    @Id @Column(name = "result_id") private UUID resultId;
    @Column(name = "reference_time", nullable = false) private OffsetDateTime referenceTime;
    @Column(name = "generated_at", nullable = false) private OffsetDateTime generatedAt;
    @Column(name = "published_at", nullable = false) private OffsetDateTime publishedAt;
    @Column(name = "fresh_until", nullable = false) private OffsetDateTime freshUntil;
    @Column(name = "expires_at", nullable = false) private OffsetDateTime expiresAt;
    @Column(name = "model_version") private String modelVersion;
    @Column(name = "active_public_station_count", nullable = false) private int activePublicStationCount;
    @Column(name = "inventory_eligible_count", nullable = false) private int inventoryEligibleCount;
    @Column(name = "evaluated_count", nullable = false) private int evaluatedCount;
    @Column(name = "normal_inference_count", nullable = false) private int normalInferenceCount;
    @Column(name = "inventory_missing_count", nullable = false) private int inventoryMissingCount;
    @Column(name = "inventory_delayed_count", nullable = false) private int inventoryDelayedCount;
    @Column(name = "inventory_unavailable_count", nullable = false) private int inventoryUnavailableCount;
    @Column(name = "inference_insufficient_count", nullable = false) private int inferenceInsufficientCount;
    @Column(name = "unevaluated_count", nullable = false) private int unevaluatedCount;
    @Column(name = "inference_call_count", nullable = false) private int inferenceCallCount;
    @Column(name = "generation_duration_ms", nullable = false) private long generationDurationMs;
    protected AdminOpsGlobalRiskResult() { }
}

@Entity
@Table(name = "admin_ops_global_risk_items")
@IdClass(AdminOpsGlobalRiskItem.Key.class)
class AdminOpsGlobalRiskItem {
    @Id @Column(name = "result_id") private UUID resultId;
    @Id @Column(name = "station_number") private String stationNumber;
    @Id @Column(name = "horizon_minutes") private int horizonMinutes;
    @Column(name = "station_name", nullable = false) private String stationName;
    @Column(name = "latitude", nullable = false) private BigDecimal latitude;
    @Column(name = "longitude", nullable = false) private BigDecimal longitude;
    @Column(name = "current_bikes") private Integer currentBikes;
    @Column(name = "inventory_collected_at") private OffsetDateTime inventoryCollectedAt;
    @Column(name = "data_state", nullable = false) private String dataState;
    @Column(name = "at_least_1_probability") private BigDecimal atLeast1;
    @Column(name = "at_least_2_probability") private BigDecimal atLeast2;
    @Column(name = "at_least_3_probability") private BigDecimal atLeast3;
    @Column(name = "at_least_4_probability") private BigDecimal atLeast4;
    @Column(name = "at_least_5_probability") private BigDecimal atLeast5;
    @Column(name = "prediction_target_at") private OffsetDateTime predictionTargetAt;
    protected AdminOpsGlobalRiskItem() { }
    public static class Key implements Serializable { public UUID resultId; public String stationNumber; public int horizonMinutes; public Key() { } }
}

@Entity
@Table(name = "admin_ops_global_risk_control")
class AdminOpsGlobalRiskControl {
    @Id @Column(name = "control_key") private String controlKey;
    @Column(name = "lease_owner") private UUID leaseOwner;
    @Column(name = "lease_started_at") private OffsetDateTime leaseStartedAt;
    @Column(name = "lease_expires_at") private OffsetDateTime leaseExpiresAt;
    @Column(name = "map_priority_requested_at") private OffsetDateTime mapPriorityRequestedAt;
    @Column(name = "current_result_id") private UUID currentResultId;
    @Column(name = "previous_result_id") private UUID previousResultId;
    @Column(name = "latest_attempt_id") private UUID latestAttemptId;
    @Column(name = "latest_attempt_started_at") private OffsetDateTime latestAttemptStartedAt;
    @Column(name = "latest_attempt_finished_at") private OffsetDateTime latestAttemptFinishedAt;
    @Column(name = "latest_attempt_state") private String latestAttemptState;
    @Column(name = "latest_attempt_reason") private String latestAttemptReason;
    @Column(name = "latest_attempt_call_count") private Integer latestAttemptCallCount;
    protected AdminOpsGlobalRiskControl() { }
}
