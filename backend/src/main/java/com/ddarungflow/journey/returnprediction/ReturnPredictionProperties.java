package com.ddarungflow.journey.returnprediction;

import java.time.Duration;

/** Configuration is deliberately not wired here; E0 owns application-wide wiring. */
public record ReturnPredictionProperties(boolean enabled, String baseUrl, Duration timeout, Duration maxResponseAge) {
    public ReturnPredictionProperties {
        if (baseUrl == null || baseUrl.isBlank()) baseUrl = "http://return-inference:8082";
        if (timeout == null || timeout.isNegative() || timeout.isZero()) timeout = Duration.ofSeconds(2);
        if (maxResponseAge == null || maxResponseAge.isNegative()) maxResponseAge = Duration.ofMinutes(15);
    }

    public static ReturnPredictionProperties defaults() {
        return new ReturnPredictionProperties(false, "http://return-inference:8082", Duration.ofSeconds(2), Duration.ofMinutes(15));
    }
}
