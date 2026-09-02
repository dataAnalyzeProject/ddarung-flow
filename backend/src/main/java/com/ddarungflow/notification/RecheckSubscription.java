package com.ddarungflow.notification;

import com.ddarungflow.journey.saved.SavedJourneyEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "consumer_recheck_subscriptions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecheckSubscription {

    public enum Kind { PLAN_RECHECK, SEARCH_RECHECK }
    public enum Status { ACTIVE, DELIVERED, CANCELLED, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false, length = 36)
    private String publicId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 20)
    private Kind kind;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "saved_journey_id")
    private SavedJourneyEntity savedJourney;

    @Column(name = "input_json", columnDefinition = "text")
    private String inputJson;

    @Column(name = "departure_at", nullable = false)
    private OffsetDateTime departureAt;

    @Column(name = "notify_at", nullable = false)
    private OffsetDateTime notifyAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    @Column(name = "dedup_key", nullable = false, length = 64)
    private String dedupKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    RecheckSubscription(String publicId, Long userId, Kind kind, SavedJourneyEntity savedJourney,
                        String inputJson, OffsetDateTime departureAt, OffsetDateTime notifyAt,
                        String dedupKey, OffsetDateTime createdAt) {
        this.publicId = publicId;
        this.userId = userId;
        this.kind = kind;
        this.savedJourney = savedJourney;
        this.inputJson = inputJson;
        this.departureAt = departureAt;
        this.notifyAt = notifyAt;
        this.status = Status.ACTIVE;
        this.dedupKey = dedupKey;
        this.createdAt = createdAt;
    }

    void markDelivered() {
        if (status == Status.ACTIVE) status = Status.DELIVERED;
    }

    void markFailed() {
        if (status == Status.ACTIVE) status = Status.FAILED;
    }

    void cancel() {
        if (status == Status.ACTIVE) status = Status.CANCELLED;
    }
}
