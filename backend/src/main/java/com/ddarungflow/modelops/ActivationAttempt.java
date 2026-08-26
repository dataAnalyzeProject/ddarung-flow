package com.ddarungflow.modelops;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "activation_attempts", uniqueConstraints = @UniqueConstraint(name = "uk_activation_attempt_correlation", columnNames = {"correlation_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivationAttempt {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "candidate_model_id", nullable = false)
    private Long candidateModelId;
    @Column(name = "previous_model_id")
    private Long previousModelId;
    @Column(name = "actor_user_id", nullable = false)
    private Long actorUserId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private ActivationAttemptStatus status;
    @Column(name = "correlation_id", nullable = false, length = 150)
    private String correlationId;
    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;
    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;
    @Column(name = "failure_reason_code", length = 100)
    private String failureReasonCode;

    @Builder
    public ActivationAttempt(Long candidateModelId, Long previousModelId, Long actorUserId, ActivationAttemptStatus status, String correlationId, OffsetDateTime startedAt) {
        this.candidateModelId = candidateModelId;
        this.previousModelId = previousModelId;
        this.actorUserId = actorUserId;
        this.correlationId = correlationId;
        this.startedAt = startedAt;
        this.status = status != null ? status : ActivationAttemptStatus.STARTED;
    }

    public void finish(ActivationAttemptStatus result, String reasonCode, OffsetDateTime finishedAt) {
        if (status != ActivationAttemptStatus.STARTED || result == null || !result.isTerminal()) {
            throw new IllegalStateException("invalid activation attempt transition");
        }
        this.status = result;
        this.failureReasonCode = reasonCode;
        this.finishedAt = finishedAt;
    }
}
