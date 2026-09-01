package com.ddarungflow.admin.operations;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "admin_ops_runtime_risk_snapshot_items")
@IdClass(AdminOpsRiskSnapshotItem.Key.class)
public class AdminOpsRiskSnapshotItem {
    @Id @Column(name = "snapshot_id") private UUID snapshotId;
    @Id @Column(name = "ordinal") private int ordinal;
    @Column(name = "station_number", nullable = false) private String stationNumber;
    @Column(name = "station_name", nullable = false) private String stationName;
    @Column(name = "latitude", nullable = false) private java.math.BigDecimal latitude;
    @Column(name = "longitude", nullable = false) private java.math.BigDecimal longitude;
    @Column(name = "current_bikes") private Integer currentBikes;
    @Column(name = "data_state", nullable = false) private String dataState;
    @Column(name = "at_least_1_probability") private java.math.BigDecimal atLeast1;
    @Column(name = "at_least_2_probability") private java.math.BigDecimal atLeast2;
    @Column(name = "at_least_3_probability") private java.math.BigDecimal atLeast3;
    @Column(name = "at_least_4_probability") private java.math.BigDecimal atLeast4;
    @Column(name = "at_least_5_probability") private java.math.BigDecimal atLeast5;
    @Column(name = "selected_shortage_probability") private java.math.BigDecimal selectedShortage;
    @Column(name = "risk_band") private String riskBand;
    @Column(name = "prediction_target_at") private OffsetDateTime predictionTargetAt;
    protected AdminOpsRiskSnapshotItem() { }
    public static class Key implements Serializable { public UUID snapshotId; public int ordinal; public Key() { } }
}
