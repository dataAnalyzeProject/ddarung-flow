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

    @Test
    void keepsCanonicalSchemaStrictWhileProducingSeparateDeepSeekWireSchema() {
        JsonNode canonical = JourneyAiSchemas.intent(mapper);
        JsonNode wire = new JourneyAiWireSchemaAdapter().adapt(canonical);

        assertThat(canonical.path("$schema").asText()).contains("2020-12");
        assertThat(canonical.path("properties").path("startAt").path("format").asText()).isEqualTo("date-time");
        assertThat(canonical.path("properties").path("destination").path("type").isArray()).isTrue();
        assertThat(canonical.path("additionalProperties").asBoolean()).isFalse();
        assertThat(canonical.path("required").isArray()).isTrue();

        assertThat(wire.has("$schema")).isFalse();
        assertThat(wire.path("properties").path("startAt").has("format")).isFalse();
        assertThat(wire.path("properties").path("destination").path("anyOf").isArray()).isTrue();
        assertThat(wire.path("properties").path("destination").path("anyOf").toString()).contains("\"type\":\"null\"");
        assertThat(wire.path("additionalProperties").asBoolean()).isFalse();
        assertThat(wire.path("required").isArray()).isTrue();
    }
}
