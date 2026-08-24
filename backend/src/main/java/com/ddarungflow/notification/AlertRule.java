package com.ddarungflow.notification;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "alert_rules")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AlertRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "station_id", nullable = false)
    private Long stationId;

    @Column(name = "condition_type", nullable = false, length = 50)
    private String conditionType;

    @Column(name = "threshold")
    private Integer threshold;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }
    }

    @Builder
    public AlertRule(Long userId, Long stationId, String conditionType, Integer threshold, Boolean enabled) {
        this.userId = userId;
        this.stationId = stationId;
        this.conditionType = conditionType;
        this.threshold = threshold;
        this.enabled = enabled != null ? enabled : true;
    }

    public void updateEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
