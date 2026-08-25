package com.ddarungflow.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class TossPaymentVerifier implements PaymentVerifier {
    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final String secretKey;

    public TossPaymentVerifier(RestClient.Builder builder, ObjectMapper objectMapper,
                               @Value("${TOSS_PAYMENTS_SECRET_KEY:}") String secretKey,
                               @Value("${toss.api-base-url:https://api.tosspayments.com}") String baseUrl) {
        this.client = builder.baseUrl(baseUrl).build();
        this.objectMapper = objectMapper;
        this.secretKey = secretKey;
    }

    @Override
    public VerifiedTossPayment verify(String paymentKey) {
        if (secretKey.isBlank() || paymentKey == null || paymentKey.isBlank()) {
            throw new IllegalStateException("payment verification is not configured");
        }
        String authorization = "Basic " + Base64.getEncoder().encodeToString((secretKey + ":").getBytes(StandardCharsets.UTF_8));
        String body = client.get().uri("/v1/payments/{paymentKey}", paymentKey)
                .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(String.class);
        try {
            JsonNode payment = objectMapper.readTree(body);
            return new VerifiedTossPayment(payment.path("orderId").asText(), paymentKey,
                    payment.path("totalAmount").asInt(-1), payment.path("currency").asText(), payment.path("status").asText());
        } catch (Exception ex) {
            throw new IllegalStateException("invalid Toss payment response", ex);
        }
    }

    @Override
    public VerifiedTossPayment confirm(String paymentKey, String orderId, int amount) {
        if (secretKey.isBlank() || paymentKey == null || paymentKey.isBlank()) throw new IllegalStateException("payment confirmation is not configured");
        String authorization = "Basic " + Base64.getEncoder().encodeToString((secretKey + ":").getBytes(StandardCharsets.UTF_8));
        String body = client.post().uri("/v1/payments/confirm")
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .body(java.util.Map.of("paymentKey", paymentKey, "orderId", orderId, "amount", amount))
                .retrieve().body(String.class);
        try {
            JsonNode payment = objectMapper.readTree(body);
            return new VerifiedTossPayment(payment.path("orderId").asText(), paymentKey,
                    payment.path("totalAmount").asInt(-1), payment.path("currency").asText(), payment.path("status").asText());
        } catch (Exception ex) { throw new IllegalStateException("invalid Toss payment response", ex); }
    }
}
