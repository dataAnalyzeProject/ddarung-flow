package com.ddarungflow.audit;

import com.ddarungflow.entity.UserRole;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(
    name = "audit_events",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_audit_event_key",
            columnNames = {"correlation_id", "action", "target_type", "target_id"}
        )
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_user_id", nullable = false)
    private Long actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_role", nullable = false, length = 50)
    private UserRole actorRole;

    @Column(name = "actor_role_codes", nullable = false, length = 500)
    private String actorRoleCodes;

    @Column(name = "action", nullable = false, length = 100)
    private String action;

    @Column(name = "target_type", nullable = false, length = 100)
    private String targetType;

    @Column(name = "target_id", nullable = false, length = 100)
    private String targetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false, length = 50)
    private AuditResult result;

    @Column(name = "reason_code", length = 100)
    private String reasonCode;

    @Column(name = "reason", length = 200)
    private String reason;

    @Column(name = "correlation_id", nullable = false, length = 150)
    private String correlationId;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private OffsetDateTime occurredAt;

    @PrePersist
    public void prePersist() {
        if (this.occurredAt == null) {
            this.occurredAt = OffsetDateTime.now();
        }
    }

    @Builder
    public AuditEvent(Long actorUserId, UserRole actorRole, String actorRoleCodes, String action, String targetType,
                      String targetId, AuditResult result, String reasonCode, String reason,
                      String correlationId, OffsetDateTime occurredAt) {
        this.actorUserId = actorUserId;
        this.actorRole = actorRole;
        this.actorRoleCodes = actorRoleCodes;
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.result = result;
        this.reasonCode = reasonCode;
        this.reason = reason;
        this.correlationId = correlationId;
        this.occurredAt = occurredAt;
    }
}
