package com.ddarungflow.payment;

public interface PaymentVerifier {
    VerifiedTossPayment verify(String paymentKey);

    void confirm(String paymentKey, String orderId, int amount);
}
