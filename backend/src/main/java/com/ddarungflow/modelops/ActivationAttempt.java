package com.ddarungflow.modelops;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(
    name = "activation_attempts",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_activation_attempt_correlation",
            columnNames = {"correlation_id"}
        )
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivationAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "candidate_model_id", nullable = false)
    private Long candidateModelId;

    @Column(name = "previous_model_id")
    private Long previousModelId;

    @Column(name = "actor_user_id", nullable = false)
    private Long actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 50)
    private ActivationAttemptStatus status;

    @Column(name = "correlation_id", nullable = false, length = 150)
    private String correlationId;

    @Column(name = "started_at", nullable = false, updatable = false)
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "failure_reason_code", length = 100)
    private String failureReasonCode;

    @PrePersist
    public void prePersist() {
        if (this.startedAt == null) {
            this.startedAt = OffsetDateTime.now();
        }
    }

    @Builder
    public ActivationAttempt(Long candidateModelId, Long previousModelId, Long actorUserId,
                             ActivationAttemptStatus status, String correlationId, OffsetDateTime startedAt) {
        this.candidateModelId = candidateModelId;
        this.previousModelId = previousModelId;
        this.actorUserId = actorUserId;
        this.status = status != null ? status : ActivationAttemptStatus.STARTED;
        this.correlationId = correlationId;
        this.startedAt = startedAt;
    }

    public void finish(ActivationAttemptStatus targetStatus, String failureReasonCode, OffsetDateTime finishedAt) {
        if (this.status != ActivationAttemptStatus.STARTED) {
            throw new IllegalStateException("종료된 활성화 시도(현재 상태: " + this.status + ")의 상태를 다시 변경할 수 없습니다.");
        }
        if (targetStatus == null || !targetStatus.isTerminal()) {
            throw new IllegalArgumentException("종료 상태는 SUCCEEDED, FAILED_COMPENSATED, COMPENSATION_FAILED 중 하나여야 합니다.");
        }
        this.status = targetStatus;
        this.failureReasonCode = failureReasonCode;
        this.finishedAt = finishedAt != null ? finishedAt : OffsetDateTime.now();
    }
}
