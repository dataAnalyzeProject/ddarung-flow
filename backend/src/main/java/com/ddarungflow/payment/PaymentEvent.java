package com.ddarungflow.payment;

import jakarta.persistence.*;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "payment_events", uniqueConstraints = @UniqueConstraint(name = "uk_payment_event_provider_event", columnNames = {"provider", "event_id"}))
@NoArgsConstructor
public class PaymentEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, updatable = false, length = 20) private String provider;
    @Column(name = "event_id", nullable = false, updatable = false, length = 120) private String eventId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, updatable = false) private PaymentEventOutcome outcome;
    @Column(nullable = false, updatable = false) private OffsetDateTime receivedAt;

    public PaymentEvent(String provider, String eventId, PaymentEventOutcome outcome) {
        this.provider = provider;
        this.eventId = eventId;
        this.outcome = outcome;
        this.receivedAt = OffsetDateTime.now();
    }

    public PaymentEventOutcome getOutcome() { return outcome; }
}
