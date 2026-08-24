package com.ddarungflow.payment;

import com.ddarungflow.entity.Users;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "payments")
@Getter
@NoArgsConstructor
public class Payment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "user_id") private Users user;
    @Column(nullable = false, unique = true, updatable = false, length = 80) private String orderId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private SubscriptionPlan plan;
    @Column(nullable = false) private int amount;
    @Column(nullable = false, length = 3) private String currency;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PaymentStatus status;
    @Column(nullable = false, updatable = false) private OffsetDateTime createdAt;

    public Payment(Users user, String orderId, SubscriptionPlan plan) {
        this.user = user;
        this.orderId = orderId;
        this.plan = plan;
        this.amount = plan.amount();
        this.currency = "KRW";
        this.status = PaymentStatus.READY;
        this.createdAt = OffsetDateTime.now();
    }

    public void markSucceeded() {
        this.status = PaymentStatus.SUCCEEDED;
    }

    public void markProcessing() {
        this.status = PaymentStatus.PROCESSING;
    }

    public void markFailed() {
        this.status = PaymentStatus.FAILED;
    }

    public void markCanceled() {
        this.status = PaymentStatus.CANCELED;
    }
}
