package com.ddarungflow.export;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "export_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExportRequest {

    public static final int MAX_PURPOSE_LENGTH = 256;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "requester_user_id", nullable = false)
    private Long requesterUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ExportSource source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ExportFormat format;

    @Column(length = MAX_PURPOSE_LENGTH)
    private String purpose;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExportStatus status;

    @Column(name = "row_count")
    private Long rowCount;

    @Column(name = "requested_at", nullable = false)
    private OffsetDateTime requestedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "failure_reason_code", length = 64)
    private String failureReasonCode;

    @Builder
    public ExportRequest(
            Long id,
            Long requesterUserId,
            ExportSource source,
            ExportFormat format,
            String purpose,
            ExportStatus status,
            Long rowCount,
            OffsetDateTime requestedAt,
            OffsetDateTime completedAt,
            OffsetDateTime expiresAt,
            String failureReasonCode
    ) {
        if (requesterUserId == null) {
            throw new IllegalArgumentException("requesterUserId는 필수입니다.");
        }
        if (source == null) {
            throw new IllegalArgumentException("source는 필수입니다.");
        }
        if (format == null) {
            throw new IllegalArgumentException("format은 필수입니다.");
        }
        if (purpose != null && purpose.length() > MAX_PURPOSE_LENGTH) {
            throw new IllegalArgumentException("purpose는 최대 " + MAX_PURPOSE_LENGTH + "자까지 허용됩니다.");
        }

        this.id = id;
        this.requesterUserId = requesterUserId;
        this.source = source;
        this.format = format;
        this.purpose = purpose;
        this.status = status != null ? status : ExportStatus.PENDING;
        this.rowCount = rowCount;
        this.requestedAt = requestedAt != null ? requestedAt : OffsetDateTime.now();
        this.completedAt = completedAt;
        this.expiresAt = expiresAt;
        this.failureReasonCode = failureReasonCode;
    }

    public void markGenerating() {
        validateTransition(ExportStatus.GENERATING);
        this.status = ExportStatus.GENERATING;
    }

    public void complete(Long rowCount, OffsetDateTime completedAt) {
        validateTransition(ExportStatus.COMPLETED);
        if (completedAt == null) {
            throw new IllegalArgumentException("completedAt은 필수입니다.");
        }
        this.rowCount = rowCount;
        this.completedAt = completedAt;
        this.expiresAt = completedAt.plusHours(24);
        this.status = ExportStatus.COMPLETED;
    }

    public void fail(String failureReasonCode, OffsetDateTime failedAt) {
        validateTransition(ExportStatus.FAILED);
        this.failureReasonCode = failureReasonCode;
        this.completedAt = failedAt != null ? failedAt : OffsetDateTime.now();
        this.status = ExportStatus.FAILED;
    }

    public void markExpired() {
        validateTransition(ExportStatus.EXPIRED);
        this.status = ExportStatus.EXPIRED;
    }

    public boolean isExpired(OffsetDateTime now) {
        if (this.status == ExportStatus.EXPIRED) {
            return true;
        }
        if (this.status != ExportStatus.COMPLETED || this.expiresAt == null) {
            return false;
        }
        return !now.isBefore(this.expiresAt);
    }

    private void validateTransition(ExportStatus nextStatus) {
        if (!this.status.canTransitionTo(nextStatus)) {
            throw new IllegalStateException(
                    String.format("잘못된 상태 전이입니다: %s -> %s", this.status, nextStatus)
            );
        }
    }
}
