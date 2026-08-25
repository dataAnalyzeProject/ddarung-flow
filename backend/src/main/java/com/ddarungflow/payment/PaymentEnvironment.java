package com.ddarungflow.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PaymentEnvironment {
    private final String paymentMode;
    private final String tossSecretKey;

    public PaymentEnvironment(
        @Value("${PAYMENT_MODE:}") String paymentMode,
        @Value("${TOSS_PAYMENTS_SECRET_KEY:}") String tossSecretKey
    ) {
        this.paymentMode = paymentMode == null ? "" : paymentMode;
        this.tossSecretKey = tossSecretKey == null ? "" : tossSecretKey;
    }

    public boolean sandboxCheckoutEnabled() {
        return !"production".equalsIgnoreCase(paymentMode) && tossSecretKey.startsWith("test_");
    }
}
