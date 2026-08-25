package com.ddarungflow.payment;

public interface PaymentVerifier {
    VerifiedTossPayment verify(String paymentKey);
    VerifiedTossPayment confirm(String paymentKey, String orderId, int amount);
}
