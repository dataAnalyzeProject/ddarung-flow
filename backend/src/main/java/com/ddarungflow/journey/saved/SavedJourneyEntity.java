package com.ddarungflow.journey.saved;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "saved_journeys", uniqueConstraints = {
        @UniqueConstraint(name = "uk_saved_journeys_public_id", columnNames = "public_id"),
        @UniqueConstraint(name = "uk_saved_journeys_user_idempotency", columnNames = {"user_id", "idempotency_key"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedJourneyEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false, length = 36)
    private String publicId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(name = "replay_input_json", nullable = false, columnDefinition = "text")
    private String replayInputJson;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    SavedJourneyEntity(Long userId, String displayName, String replayInputJson, String payloadHash, String idempotencyKey) {
        this.userId = userId;
        this.displayName = displayName;
        this.replayInputJson = replayInputJson;
        this.payloadHash = payloadHash;
        this.idempotencyKey = idempotencyKey;
    }

    @PrePersist
    void createMetadata() {
        if (publicId == null) publicId = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
