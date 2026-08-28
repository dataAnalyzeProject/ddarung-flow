package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpenAiResponsesClientTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final OpenAiResponsesClient client = new OpenAiResponsesClient(
            new JourneyAiProperties(true, URI.create("https://example.test/v1/responses"), "not-a-real-key", "runtime-model", Duration.ofSeconds(2)), mapper
    );

    @Test
    void buildsResponsesStructuredOutputRequestWithStoreDisabled() throws Exception {
        var payload = mapper.readTree(client.requestBody("ORIGIN_A", "journey_intent", mapper.readTree("{\"type\":\"object\"}")));

        assertThat(payload.path("store").asBoolean()).isFalse();
        assertThat(payload.path("model").asText()).isEqualTo("runtime-model");
        assertThat(payload.path("text").path("format").path("type").asText()).isEqualTo("json_schema");
        assertThat(payload.path("text").path("format").path("strict").asBoolean()).isTrue();
    }

    @Test
    void mapsRateLimitAndServerFailuresToUnavailableWithoutLeakingBody() {
        assertThat(client.statusError(429).code()).isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        assertThat(client.statusError(500).code()).isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
    }

    @Test
    void rejectsDisabledOrMissingProviderWithoutNetwork() throws Exception {
        OpenAiResponsesClient disabled = new OpenAiResponsesClient(JourneyAiProperties.disabled(), mapper);
        assertThatThrownBy(() -> disabled.requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}")))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_DISABLED);

        OpenAiResponsesClient unconfigured = new OpenAiResponsesClient(new JourneyAiProperties(true, null, "", "", null), mapper);
        assertThatThrownBy(() -> unconfigured.requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}")))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
    }

    @Test
    void extractsOutputTextAfterReasoningItemsWithoutAssumingOutputOrder() throws Exception {
        OpenAiResponsesClient fixture = fixture("""
                {"status":"completed","output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":"{\\"origin\\":\\"ORIGIN_A\\"}"}]}]}
                """);

        assertThat(fixture.requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}"))).isEqualTo(mapper.readTree("{\"origin\":\"ORIGIN_A\"}"));
    }

    @Test
    void classifiesRefusalIncompleteAndMalformedSuccessfulTransportResponses() throws Exception {
        assertCode("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"refusal\",\"refusal\":\"cannot comply\"}]}]}", JourneyAiErrorCode.AI_PROVIDER_REFUSAL);
        assertCode("{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"},\"output\":[]}", JourneyAiErrorCode.AI_RESPONSE_INCOMPLETE);
        assertCode("not-json", JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
        assertCode("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"not-json\"}]}]}", JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
    }

    private OpenAiResponsesClient fixture(String body) {
        return new OpenAiResponsesClient(
                new JourneyAiProperties(true, URI.create("https://example.test/v1/responses"), "not-a-real-key", "runtime-model", Duration.ofSeconds(2)),
                mapper,
                request -> new OpenAiResponsesClient.TransportResponse(200, body)
        );
    }

    private void assertCode(String body, JourneyAiErrorCode expected) throws Exception {
        assertThatThrownBy(() -> fixture(body).requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}")))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(expected);
    }
}
