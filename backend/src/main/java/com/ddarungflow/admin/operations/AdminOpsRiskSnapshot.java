package com.ddarungflow.admin.operations;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** JPA schema model keeps test databases aligned with the V12 Flyway migration. */
@Entity
@Table(name = "admin_ops_runtime_risk_snapshots")
public class AdminOpsRiskSnapshot {
    @Id @Column(name = "snapshot_id") private UUID snapshotId;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt;
    @Column(name = "expires_at", nullable = false) private OffsetDateTime expiresAt;
    @Column(name = "reference_time", nullable = false) private OffsetDateTime referenceTime;
    @Column(name = "horizon_minutes", nullable = false) private int horizonMinutes;
    @Column(name = "required_bike_count", nullable = false) private int requiredBikeCount;
    @Column(name = "min_lng", nullable = false) private java.math.BigDecimal minLng;
    @Column(name = "min_lat", nullable = false) private java.math.BigDecimal minLat;
    @Column(name = "max_lng", nullable = false) private java.math.BigDecimal maxLng;
    @Column(name = "max_lat", nullable = false) private java.math.BigDecimal maxLat;
    @Column(name = "data_state_filter") private String dataStateFilter;
    @Column(name = "model_version", nullable = false) private String modelVersion;
    @Column(name = "eligible_station_count", nullable = false) private int eligibleStationCount;
    @Column(name = "evaluated_station_count", nullable = false) private int evaluatedStationCount;
    @Column(name = "normal_inference_success_count", nullable = false) private int normalInferenceSuccessCount;
    protected AdminOpsRiskSnapshot() { }
}
