package com.ddarungflow.modelops;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "model_uploads")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ModelUpload {

    @Id
    private UUID id;

    @Column(name = "requested_by_user_id", nullable = false)
    private Long requestedByUserId;

    @Column(name = "object_key", nullable = false, unique = true, length = 512)
    private String objectKey;

    @Column(name = "expected_sha256", nullable = false, length = 64)
    private String expectedSha256;

    @Column(name = "max_bytes", nullable = false)
    private Long maxBytes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ModelUploadStatus status;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public ModelUpload(
        UUID id,
        Long requestedByUserId,
        String objectKey,
        String expectedSha256,
        Long maxBytes,
        ModelUploadStatus status,
        OffsetDateTime expiresAt,
        OffsetDateTime completedAt,
        OffsetDateTime createdAt
    ) {
        if (id == null) {
            throw new IllegalArgumentException("id must not be null");
        }
        if (requestedByUserId == null) {
            throw new IllegalArgumentException("requestedByUserId must not be null");
        }
        if (objectKey == null || objectKey.isBlank()) {
            throw new IllegalArgumentException("objectKey must not be null or blank");
        }
        if (expectedSha256 == null || !expectedSha256.matches("^[0-9a-f]{64}$")) {
            throw new IllegalArgumentException("expectedSha256 must be a 64-character lowercase hexadecimal string");
        }
        if (maxBytes == null || maxBytes <= 0) {
            throw new IllegalArgumentException("maxBytes must be positive");
        }
        if (status == null) {
            throw new IllegalArgumentException("status must not be null");
        }
        if (createdAt == null || expiresAt == null) {
            throw new IllegalArgumentException("createdAt and expiresAt must not be null");
        }
        if (!expiresAt.isAfter(createdAt)) {
            throw new IllegalArgumentException("expiresAt must be strictly after createdAt");
        }

        this.id = id;
        this.requestedByUserId = requestedByUserId;
        this.objectKey = objectKey;
        this.expectedSha256 = expectedSha256;
        this.maxBytes = maxBytes;
        this.status = status;
        this.expiresAt = expiresAt;
        this.completedAt = completedAt;
        this.createdAt = createdAt;
    }

    public void markCompleted(OffsetDateTime now) {
        this.status = ModelUploadStatus.COMPLETED;
        this.completedAt = now;
    }

    public void markFailed() {
        this.status = ModelUploadStatus.FAILED;
    }

    public void markExpired() {
        this.status = ModelUploadStatus.EXPIRED;
    }
}
