package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JourneyAiSchemaTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void shipsAllRequiredStructuredOutputSchemas() throws Exception {
        for (String name : List.of("journey-intent.schema.json", "journey-tool-plan.schema.json", "journey-explanation.schema.json")) {
            try (InputStream input = getClass().getResourceAsStream("/journey/ai/" + name)) {
                JsonNode schema = mapper.readTree(input);
                assertThat(schema.path("type").asText()).isEqualTo("object");
                assertThat(schema.path("additionalProperties").asBoolean()).isFalse();
                assertThat(schema.path("required").isArray()).isTrue();
            }
        }
    }
}
