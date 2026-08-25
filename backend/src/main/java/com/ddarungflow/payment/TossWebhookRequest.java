package com.ddarungflow.payment;

public record TossWebhookRequest(String eventType, PaymentData data) {
    public record PaymentData(String paymentKey) {
    }
}
