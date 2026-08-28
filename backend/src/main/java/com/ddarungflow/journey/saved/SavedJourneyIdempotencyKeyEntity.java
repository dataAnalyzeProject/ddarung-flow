package com.ddarungflow.journey.saved;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "saved_journey_idempotency_keys", uniqueConstraints =
        @UniqueConstraint(name = "uk_saved_journey_idempotency_keys_user_key", columnNames = {"user_id", "idempotency_key"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedJourneyIdempotencyKeyEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "saved_journey_id", nullable = false)
    private SavedJourneyEntity savedJourney;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    SavedJourneyIdempotencyKeyEntity(Long userId, String idempotencyKey, String requestHash, SavedJourneyEntity savedJourney) {
        this.userId = userId;
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.savedJourney = savedJourney;
    }

    @PrePersist
    void createMetadata() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
