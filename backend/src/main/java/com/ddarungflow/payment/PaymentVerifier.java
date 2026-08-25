package com.ddarungflow.payment;

public interface PaymentVerifier {
    VerifiedTossPayment verify(String paymentKey);
}
