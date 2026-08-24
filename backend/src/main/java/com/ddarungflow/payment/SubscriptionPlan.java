package com.ddarungflow.payment;

import java.time.Duration;

public enum SubscriptionPlan {
    PREMIUM_MONTHLY_30D(2900, Duration.ofDays(30)),
    PREMIUM_YEARLY_365D(29000, Duration.ofDays(365));

    private final int amount;
    private final Duration duration;
    SubscriptionPlan(int amount, Duration duration) { this.amount = amount; this.duration = duration; }
    public int amount() { return amount; }
    public Duration duration() { return duration; }
}
