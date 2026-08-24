package com.ddarungflow.payment;

public record VerifiedTossPayment(String orderId, String paymentKey, int amount, String currency, String status) {
    public boolean isDone() {
        return "DONE".equals(status);
    }
}
