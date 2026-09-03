package com.ddarungflow.journey.ai;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ResponsesApiClientTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ResponsesApiClient client = new ResponsesApiClient(
            new JourneyAiProperties(true, URI.create("https://example.test/responses"), "not-a-real-key", "runtime-model", Duration.ofSeconds(2)), mapper
    );

    @Test
    void buildsDeepSeekResponsesStructuredOutputRequest() throws Exception {
        var payload = mapper.readTree(client.requestBody("ORIGIN_A", "journey_intent", mapper.readTree("{\"type\":\"object\"}")));

        assertThat(payload.path("model").asText()).isEqualTo("runtime-model");
        assertThat(payload.path("instructions").asText()).isNotBlank();
        assertThat(mapper.readTree(payload.path("input").asText()).path("naturalLanguageText").asText()).isEqualTo("ORIGIN_A");
        assertThat(payload.path("reasoning").path("effort").asText()).isEqualTo("none");
        assertThat(payload.path("text").path("format").path("type").asText()).isEqualTo("json_schema");
        assertThat(payload.path("text").path("format").path("name").asText()).isEqualTo("journey_intent");
        assertThat(payload.path("text").path("format").path("schema")).isNotNull();
        assertThat(payload.has("store")).isFalse();
        assertThat(payload.path("text").path("format").has("strict")).isFalse();
    }

    @Test
    void sendsOnlyAllowlistedCompileContextInInstructionsAndInputContract() throws Exception {
        JourneyCompileRequest request = new JourneyCompileRequest("성수에서 출발", new PlaceReference("성수역", "ORIGIN_A"),
                new PlaceReference("서울숲", "DESTINATION_B"), OffsetDateTime.parse("2026-08-30T18:30:00+09:00"), 60, 2);
        var payload = mapper.readTree(client.requestBody(request, "journey_intent", mapper.readTree("{\"type\":\"object\"}")));
        var input = mapper.readTree(payload.path("input").asText());

        assertThat(payload.path("instructions").asText()).contains("authoritative");
        assertThat(input.path("origin").path("displayName").asText()).isEqualTo("성수역");
        assertThat(input.path("origin").path("placeId").asText()).isEqualTo("ORIGIN_A");
        assertThat(OffsetDateTime.parse(input.path("departureAt").asText())).isEqualTo(request.departureAt());
        assertThat(input.path("requiredBikeCount").asInt()).isEqualTo(2);
        assertThat(input.toString()).doesNotContain("latitude").doesNotContain("longitude").doesNotContain("userId")
                .doesNotContain("Authorization").doesNotContain("cookie").doesNotContain("secret");
    }

    @Test
    void textOnlyInputProvidesCurrentSeoulTimeWithoutInventingStructuredValues() throws Exception {
        OffsetDateTime before = OffsetDateTime.now();
        JsonNode payload = mapper.readTree(client.requestBody("오후 3시에 한강을 타고 싶어", "journey_intent", mapper.readTree("{}")));
        JsonNode input = mapper.readTree(payload.path("input").asText());
        OffsetDateTime current = OffsetDateTime.parse(input.path("currentDateTime").asText());

        assertThat(current.toInstant()).isBetween(before.toInstant(), OffsetDateTime.now().toInstant());
        assertThat(current.getOffset()).isEqualTo(ZoneOffset.ofHours(9));
        assertThat(input.path("timeZone").asText()).isEqualTo("Asia/Seoul");
        assertThat(input.path("origin").isNull()).isTrue();
        assertThat(input.path("departureAt").isNull()).isTrue();
        assertThat(input.has("maxJourneyMinutes")).isFalse();
        assertThat(input.has("requiredBikeCount")).isFalse();
        assertThat(payload.path("instructions").asText()).contains("next future occurrence", "return null", "placeId to an empty string");
    }

    @Test
    void genericStructuredOutputKeepsCallerInstructionsAndJsonInputWithoutChangingJourneyTransport() throws Exception {
        JsonNode input = mapper.readTree("{\"evidence\":{\"rentalCandidates\":{}}}");
        JsonNode schema = mapper.readTree("{\"type\":\"object\"}");

        JsonNode payload = mapper.readTree(client.requestBody(input, "Use evidence only.", "riding_guide", schema));

        assertThat(payload.path("instructions").asText()).isEqualTo("Use evidence only.");
        assertThat(mapper.readTree(payload.path("input").asText())).isEqualTo(input);
        assertThat(payload.path("text").path("format").path("name").asText()).isEqualTo("riding_guide");
    }

    @Test
    void mapsRateLimitAndServerFailuresToUnavailableWithoutLeakingBody() {
        assertThat(client.statusError(429).code()).isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        assertThat(client.statusError(500).code()).isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
    }

    @Test
    void logsOnlySafeProviderAttemptStatusAndTransportCategories() throws Exception {
        ListAppender<ILoggingEvent> logs = attachLogs();
        try {
            ResponsesApiClient rateLimited = fixture(429, "provider raw response: secret");
            assertThatThrownBy(() -> rateLimited.requestStructuredOutput("raw natural-language sentinel", "intent", mapper.readTree("{}")))
                    .extracting(exception -> ((JourneyAiException) exception).code())
                    .isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);

            ResponsesApiClient failedTransport = new ResponsesApiClient(properties(), mapper, request -> {
                throw new IOException("provider raw response: secret");
            });
            assertThatThrownBy(() -> failedTransport.requestStructuredOutput("raw natural-language sentinel", "intent", mapper.readTree("{}")))
                    .extracting(exception -> ((JourneyAiException) exception).code())
                    .isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);

            String messages = logs.list.stream().map(ILoggingEvent::getFormattedMessage).collect(java.util.stream.Collectors.joining("\n"));
            assertThat(messages).contains("event=journey_ai_provider_request attempted=true")
                    .contains("event=journey_ai_provider_response status=429")
                    .contains("outcome=FAILURE", "stage=TRANSPORT", "code=AI_PROVIDER_UNAVAILABLE", "correlation_id=", "latency_ms=")
                    .doesNotContain("outcome=SUCCESS")
                    .doesNotContain("raw natural-language sentinel", "provider raw response", "not-a-real-key", "Authorization", "Bearer");
            assertThat(logs.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
        } finally {
            detachLogs(logs);
        }
    }

    @Test
    void distinguishesTimeoutFromTransportFailureAndLogsNoRawException() throws Exception {
        ListAppender<ILoggingEvent> logs = attachLogs();
        try {
            ResponsesApiClient timedOut = new ResponsesApiClient(properties(), mapper, request -> {
                throw new HttpTimeoutException("raw timeout exception sentinel");
            });
            assertThatThrownBy(() -> timedOut.requestStructuredOutput("raw prompt sentinel", "journey_intent", mapper.readTree("{}")))
                    .satisfies(exception -> {
                        assertThat(((JourneyAiException) exception).code()).isEqualTo(JourneyAiErrorCode.AI_PROVIDER_TIMEOUT);
                        assertThat(exception.getCause()).isNull();
                    });

            String messages = logs.list.stream().map(ILoggingEvent::getFormattedMessage).collect(java.util.stream.Collectors.joining("\n"));
            assertThat(messages).contains("kind=INTENT_COMPILE", "outcome=REQUEST", "outcome=FAILURE", "code=AI_PROVIDER_TIMEOUT", "stage=TIMEOUT")
                    .doesNotContain("outcome=SUCCESS", "raw prompt sentinel", "raw timeout exception sentinel", "not-a-real-key");
            assertThat(logs.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
        } finally {
            detachLogs(logs);
        }
    }

    @Test
    void rejectsDisabledOrMissingProviderWithoutNetwork() throws Exception {
        ResponsesApiClient disabled = new ResponsesApiClient(JourneyAiProperties.disabled(), mapper);
        assertThatThrownBy(() -> disabled.requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}")))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_DISABLED);

        ResponsesApiClient unconfigured = new ResponsesApiClient(new JourneyAiProperties(true, null, "", "", null), mapper);
        assertThatThrownBy(() -> unconfigured.requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}")))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
    }

    @Test
    void extractsOutputTextAfterReasoningItemsWithoutAssumingOutputOrder() throws Exception {
        ResponsesApiClient fixture = fixture("""
                {"status":"completed","output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":"{\\"origin\\":\\"ORIGIN_A\\"}"}]}]}
                """);

        assertThat(fixture.requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}"))).isEqualTo(mapper.readTree("{\"origin\":\"ORIGIN_A\"}"));
    }

    @Test
    void classifiesRefusalIncompleteFailedAndMalformedSuccessfulTransportResponses() throws Exception {
        assertCode("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"refusal\",\"refusal\":\"cannot comply\"}]}]}", JourneyAiErrorCode.AI_PROVIDER_REFUSAL);
        assertCode("{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"},\"output\":[]}", JourneyAiErrorCode.AI_RESPONSE_INCOMPLETE);
        assertCode("{\"status\":\"failed\",\"error\":{\"message\":\"provider detail must not escape\"},\"output\":[]}", JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        assertCode("not-json", JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, JourneyAiFailureStage.RESPONSE_ENVELOPE);
        assertCode("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"not-json\"}]}]}", JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, JourneyAiFailureStage.OUTPUT_TEXT_JSON);
    }

    private ResponsesApiClient fixture(String body) {
        return fixture(200, body);
    }

    private ResponsesApiClient fixture(int status, String body) {
        return new ResponsesApiClient(
                properties(),
                mapper,
                request -> new ResponsesApiClient.TransportResponse(status, body)
        );
    }

    private JourneyAiProperties properties() {
        return new JourneyAiProperties(true, URI.create("https://example.test/responses"), "not-a-real-key", "runtime-model", Duration.ofSeconds(2));
    }

    private ListAppender<ILoggingEvent> attachLogs() {
        Logger logger = (Logger) LoggerFactory.getLogger(ResponsesApiClient.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachLogs(ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger(ResponsesApiClient.class)).detachAppender(appender);
        appender.stop();
    }

    private void assertCode(String body, JourneyAiErrorCode expected) throws Exception {
        assertCode(body, expected, null);
    }

    private void assertCode(String body, JourneyAiErrorCode expected, JourneyAiFailureStage stage) throws Exception {
        assertThatThrownBy(() -> fixture(body).requestStructuredOutput("ORIGIN_A", "intent", mapper.readTree("{}")))
                .satisfies(exception -> {
                    JourneyAiException journeyException = (JourneyAiException) exception;
                    assertThat(journeyException.code()).isEqualTo(expected);
                    assertThat(journeyException.failureStage()).isEqualTo(stage);
                });
    }
}
