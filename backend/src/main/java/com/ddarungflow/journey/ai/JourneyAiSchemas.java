package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;

public final class JourneyAiSchemas {
    private JourneyAiSchemas() { }

    public static JsonNode intent(ObjectMapper objectMapper) {
        try (InputStream input = JourneyAiSchemas.class.getResourceAsStream("/journey/ai/journey-intent.schema.json")) {
            if (input == null) throw new IllegalStateException("journey intent schema is missing");
            return objectMapper.readTree(input);
        } catch (Exception exception) {
            throw new IllegalStateException("journey intent schema cannot be loaded", exception);
        }
    }
}
