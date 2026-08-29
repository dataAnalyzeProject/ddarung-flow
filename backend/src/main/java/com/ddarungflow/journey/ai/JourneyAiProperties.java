package com.ddarungflow.journey.ai;

import java.net.URI;
import java.time.Duration;

/**
 * D0 is deliberately not a Spring component. E0 owns binding these values to runtime configuration.
 */
public record JourneyAiProperties(boolean enabled, URI responsesUri, String apiKey, String model, Duration timeout) {
    public JourneyAiProperties {
        responsesUri = responsesUri == null ? URI.create("https://api.deepseek.com/responses") : responsesUri;
        apiKey = apiKey == null ? "" : apiKey;
        model = model == null ? "" : model;
        timeout = timeout == null ? Duration.ofSeconds(10) : timeout;
    }

    public static JourneyAiProperties disabled() {
        return new JourneyAiProperties(false, null, "", "", null);
    }

    public boolean providerConfigured() {
        return !apiKey.isBlank() && !model.isBlank();
    }
}
