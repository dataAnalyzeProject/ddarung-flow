package com.ddarungflow.journey.ai;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import java.math.BigDecimal;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DefaultJourneyAiGatewayTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void preservesDeterministicFallbackWhenAiIsDisabledOrUnconfigured() throws Exception {
        var disabled = new DefaultJourneyAiGateway(JourneyAiProperties.disabled(), mapper, mapper.readTree("{}"));
        var unconfigured = new DefaultJourneyAiGateway(new JourneyAiProperties(true, null, "", "", null), mapper, mapper.readTree("{}"));

        assertThat(disabled.compileIntent("ORIGIN_A").unavailableCode()).isEqualTo(JourneyAiErrorCode.AI_DISABLED);
        assertThat(unconfigured.compileIntent("ORIGIN_A").unavailableCode()).isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
    }

    @Test
    void returnsOnlyValidatedToolRequestsAndDoesNotExecuteThem() throws Exception {
        var gateway = new DefaultJourneyAiGateway(JourneyAiProperties.disabled(), mapper, mapper.readTree("{}"));

        assertThat(gateway.validateToolPlan(List.of(new ToolCallRequest("tool-1", "get_cycle_routes", List.of(
                new ToolArgument("originPlaceId", ToolArgumentType.STRING, "ORIGIN_A"),
                new ToolArgument("destinationPlaceId", ToolArgumentType.STRING, "DESTINATION_B")
        )))))
                .extracting(ToolCallRequest::callId)
                .containsExactly("tool-1");
    }

    @Test
    void validatesProviderOutputWithTheSameSchemaPassedToTheGateway() throws Exception {
        ObjectNode providerSchema = JourneyAiSchemas.intent(mapper).deepCopy();
        providerSchema.withArray("required").add("providerMarker");
        providerSchema.with("properties").putObject("providerMarker").put("type", "string");
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        ResponsesApiClient client = new ResponsesApiClient(properties, mapper,
                request -> new ResponsesApiClient.TransportResponse(200, completedResponseWithoutProviderMarker()));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(properties, mapper, providerSchema, client);

        assertThatThrownBy(() -> gateway.compileIntent("ORIGIN_A에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
    }

    @Test
    void parsesOnlyTheStrictScheduleSelectionShape() throws Exception {
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        ResponsesApiClient client = new ResponsesApiClient(properties, mapper,
                request -> new ResponsesApiClient.TransportResponse(200, completedResponse("""
                        {"rentalCandidateId":"rental:station-1","stops":[],"routeEvidenceIds":[],
                         "weatherEvidenceIds":[],"airQualityEvidenceIds":[],"factRefs":[],"factValues":[],
                         "rationale":"근거 ID 선택","rationaleTags":["EVIDENCE_ONLY"]}
                        """)));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(
                properties, mapper, JourneyAiSchemas.intent(mapper), client);

        JourneyAiGateway.ScheduleResult result = gateway.selectSchedule(
                new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60));

        assertThat(result.selection().rentalCandidateId()).isEqualTo("rental:station-1");
        assertThat(result.selection().rationaleTags()).containsExactly("EVIDENCE_ONLY");
    }

    @Test
    void excludesAccessRoutesFromScheduleInputAndKeepsRentalAccessFacts() throws Exception {
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(
                properties, mapper, JourneyAiSchemas.intent(mapper), new ResponsesApiClient(properties, mapper, request -> null));
        ConsumerAiEvidenceBundle.Evidence rental = evidence("rental:station-1", Map.of(),
                Map.of("accessDistanceMeters", BigDecimal.valueOf(673), "accessDurationSeconds", BigDecimal.valueOf(660)));
        ConsumerAiEvidenceBundle.Evidence access = evidence("route:access:station-1",
                Map.of("segmentType", "ACCESS", "travelMode", "WALK"), Map.of());
        ConsumerAiEvidenceBundle.Evidence bicycle = evidence("route:rental:station-1:poi-1",
                Map.of("fromEvidenceId", "rental:station-1", "toEvidenceId", "poi-1", "travelMode", "BICYCLE"), Map.of());
        ConsumerAiEvidenceBundle.Evidence unavailable = new ConsumerAiEvidenceBundle.Evidence(
                "route:unavailable", "kakao-bicycle", ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE,
                OffsetDateTime.parse("2026-09-09T12:00:00+09:00"),
                Map.of("fromEvidenceId", "rental:station-1", "toEvidenceId", "poi-2", "routeMode", "BIKE_ONLY"), Map.of());

        ConsumerAiEvidenceBundle filtered = gateway.scheduleEvidence(new ConsumerAiEvidenceBundle(
                Map.of(rental.evidenceId(), rental), Map.of(),
                Map.of(access.evidenceId(), access, bicycle.evidenceId(), bicycle, unavailable.evidenceId(), unavailable),
                Map.of(), Map.of()));

        assertThat(filtered.routes()).containsOnlyKeys(bicycle.evidenceId());
        assertThat(filtered.rentalCandidates().get(rental.evidenceId()).numericFacts())
                .containsEntry("accessDistanceMeters", BigDecimal.valueOf(673))
                .containsEntry("accessDurationSeconds", BigDecimal.valueOf(660));
    }

    @Test
    void retriesScheduleOnceWhenOutputTextIsNotJson() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        ResponsesApiClient client = new ResponsesApiClient(properties, mapper, request ->
                new ResponsesApiClient.TransportResponse(200, attempts.incrementAndGet() == 1
                        ? completedResponse("not-json")
                        : completedResponse(validSchedule())));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper), client);

        JourneyAiGateway.ScheduleResult result = gateway.selectSchedule(
                new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60));

        assertThat(result.available()).isTrue();
        assertThat(attempts).hasValue(2);
    }

    @Test
    void retriesIntentOnceWhenOutputTextIsNotJson() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        ResponsesApiClient client = new ResponsesApiClient(properties, mapper, request ->
                new ResponsesApiClient.TransportResponse(200, attempts.incrementAndGet() == 1
                        ? completedResponse("not-json")
                        : completedResponse(validIntent())));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper), client);

        JourneyAiGateway.IntentResult result = gateway.compileIntent("성수에서 출발");

        assertThat(result.available()).isTrue();
        assertThat(result.intent().origin().displayName()).isEqualTo("성수역");
        assertThat(attempts).hasValue(2);
    }

    @Test
    void stopsIntentAfterSecondOutputTextJsonFailureAndDoesNotRetryOtherFailures() throws Exception {
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        AtomicInteger malformedAttempts = new AtomicInteger();
        DefaultJourneyAiGateway malformedGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    malformedAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(200, completedResponse("not-json"));
                }));

        assertThatThrownBy(() -> malformedGateway.compileIntent("성수에서 출발"))
                .satisfies(exception -> {
                    JourneyAiException failure = (JourneyAiException) exception;
                    assertThat(failure.code()).isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
                    assertThat(failure.failureStage()).isEqualTo(JourneyAiFailureStage.OUTPUT_TEXT_JSON);
                });
        assertThat(malformedAttempts).hasValue(2);

        AtomicInteger canonicalAttempts = new AtomicInteger();
        DefaultJourneyAiGateway canonicalGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    canonicalAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(200, completedResponse("{}"));
                }));
        assertThatThrownBy(() -> canonicalGateway.compileIntent("성수에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).failureStage())
                .isEqualTo(JourneyAiFailureStage.CANONICAL_SCHEMA);
        assertThat(canonicalAttempts).hasValue(1);

        AtomicInteger semanticAttempts = new AtomicInteger();
        DefaultJourneyAiGateway semanticGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    semanticAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(200, completedResponse(incompleteIntentWithoutClarification()));
                }));
        assertThatThrownBy(() -> semanticGateway.compileIntent("성수에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).failureStage())
                .isEqualTo(JourneyAiFailureStage.SEMANTIC_INTENT);
        assertThat(semanticAttempts).hasValue(1);

        AtomicInteger envelopeAttempts = new AtomicInteger();
        DefaultJourneyAiGateway envelopeGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    envelopeAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(200, "not-json");
                }));
        assertThatThrownBy(() -> envelopeGateway.compileIntent("성수에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).failureStage())
                .isEqualTo(JourneyAiFailureStage.RESPONSE_ENVELOPE);
        assertThat(envelopeAttempts).hasValue(1);

        assertIntentProviderResponseNotRetried(503, "{}", JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        assertIntentProviderResponseNotRetried(200,
                "{\"status\":\"incomplete\",\"output\":[]}", JourneyAiErrorCode.AI_RESPONSE_INCOMPLETE);
        assertIntentProviderResponseNotRetried(200,
                "{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"refusal\",\"refusal\":\"no\"}]}]}",
                JourneyAiErrorCode.AI_PROVIDER_REFUSAL);

        AtomicInteger timeoutAttempts = new AtomicInteger();
        DefaultJourneyAiGateway timeoutGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    timeoutAttempts.incrementAndGet();
                    throw new HttpTimeoutException("timeout");
                }));
        assertThatThrownBy(() -> timeoutGateway.compileIntent("성수에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PROVIDER_TIMEOUT);
        assertThat(timeoutAttempts).hasValue(1);
    }

    @Test
    void stopsAfterSecondOutputTextJsonFailureAndDoesNotRetryOtherFailures() throws Exception {
        AtomicInteger malformedAttempts = new AtomicInteger();
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        DefaultJourneyAiGateway malformedGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    malformedAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(200, completedResponse("not-json"));
                }));

        assertThatThrownBy(() -> malformedGateway.selectSchedule(
                new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60)))
                .satisfies(exception -> {
                    JourneyAiException failure = (JourneyAiException) exception;
                    assertThat(failure.code()).isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
                    assertThat(failure.failureStage()).isEqualTo(JourneyAiFailureStage.OUTPUT_TEXT_JSON);
                });
        assertThat(malformedAttempts).hasValue(2);

        AtomicInteger canonicalAttempts = new AtomicInteger();
        DefaultJourneyAiGateway canonicalGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    canonicalAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(200, completedResponse("{}"));
                }));
        assertThatThrownBy(() -> canonicalGateway.selectSchedule(
                new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60)))
                .extracting(exception -> ((JourneyAiException) exception).failureStage())
                .isEqualTo(JourneyAiFailureStage.CANONICAL_SCHEMA);
        assertThat(canonicalAttempts).hasValue(1);

        AtomicInteger providerAttempts = new AtomicInteger();
        DefaultJourneyAiGateway unavailableGateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    providerAttempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(503, "{}");
                }));
        assertThatThrownBy(() -> unavailableGateway.selectSchedule(
                new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60)))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        assertThat(providerAttempts).hasValue(1);
    }

    @Test
    void emitsIntentSuccessButDefersScheduleSuccessUntilEvidenceValidation() throws Exception {
        Logger logger = (Logger) LoggerFactory.getLogger(ResponsesApiClient.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        String previousCorrelation = MDC.get("journeyAiCorrelationId");
        try {
            AtomicReference<String> response = new AtomicReference<>(completedResponseWithoutProviderMarker());
            JourneyAiProperties properties = new JourneyAiProperties(true, null, "private-key-sentinel", "test-model", Duration.ofSeconds(1));
            ResponsesApiClient client = new ResponsesApiClient(properties, mapper,
                    request -> new ResponsesApiClient.TransportResponse(200, response.get()));
            DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper), client);

            gateway.compileIntent("private-prompt-sentinel");
            response.set(completedResponse("""
                    {"rentalCandidateId":"rental:station-1","stops":[],"routeEvidenceIds":[],"weatherEvidenceIds":[],"airQualityEvidenceIds":[],"factRefs":[],"factValues":[],"rationale":"private-output-sentinel","rationaleTags":[]}
                    """));
            MDC.put("journeyAiCorrelationId", "schedule-correlation-test");
            gateway.selectSchedule(new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                    new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60));
            MDC.remove("journeyAiCorrelationId");

            List<String> successes = logs.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.contains("outcome=SUCCESS")).toList();
            assertThat(successes).hasSize(1);
            assertThat(successes.get(0)).contains("kind=INTENT_COMPILE", "stage=VALIDATED_OUTPUT");
            assertThat(logs.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.contains("kind=SCHEDULE_SELECTION") && message.contains("outcome=OUTPUT_VALIDATED")))
                    .singleElement().asString().contains("correlation_id=schedule-correlation-test", "stage=VALIDATED_OUTPUT");
            assertThat(logs.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.contains("outcome=REQUEST") && message.contains("correlation_id=schedule-correlation-test"))).hasSize(1);
            assertThat(logs.list.stream().map(ILoggingEvent::getFormattedMessage).collect(java.util.stream.Collectors.joining("\n")))
                    .doesNotContain("private-prompt-sentinel", "private-output-sentinel", "private-key-sentinel");
            assertThat(logs.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
            for (String success : successes) {
                String correlation = success.split("correlation_id=")[1].split(" ")[0];
                assertThat(logs.list.stream().map(ILoggingEvent::getFormattedMessage)
                        .filter(message -> message.contains("outcome=REQUEST") && message.contains("correlation_id=" + correlation))).hasSize(1);
            }

            logs.list.clear();
            response.set(completedResponse("{\"private-output-sentinel\":true}"));
            assertThatThrownBy(() -> gateway.compileIntent("private-prompt-sentinel"))
                    .isInstanceOf(JourneyAiException.class);
            assertThatThrownBy(() -> gateway.selectSchedule(new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                    new JourneyAiGateway.ScheduleConstraints(1, 10, 120, 60))).isInstanceOf(JourneyAiException.class);
            String messages = logs.list.stream().map(ILoggingEvent::getFormattedMessage).collect(java.util.stream.Collectors.joining("\n"));
            assertThat(messages).contains("kind=INTENT_COMPILE", "kind=SCHEDULE_SELECTION", "outcome=FAILURE", "code=AI_OUTPUT_SCHEMA_INVALID", "stage=CANONICAL_SCHEMA")
                    .doesNotContain("outcome=SUCCESS", "private-prompt-sentinel", "private-output-sentinel", "private-key-sentinel");
            assertThat(logs.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
        } finally {
            if (previousCorrelation == null) MDC.remove("journeyAiCorrelationId");
            else MDC.put("journeyAiCorrelationId", previousCorrelation);
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    private String completedResponseWithoutProviderMarker() throws Exception {
        String intent = """
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A"},"destination":null,"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """;
        return """
                {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":%s}]}]}
                """.formatted(mapper.writeValueAsString(intent));
    }

    private String completedResponse(String output) throws Exception {
        return """
                {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":%s}]}]}
                """.formatted(mapper.writeValueAsString(output));
    }

    private String validSchedule() {
        return """
                {"rentalCandidateId":"rental:station-1","stops":[],"routeEvidenceIds":[],
                 "weatherEvidenceIds":[],"airQualityEvidenceIds":[],"factRefs":[],"factValues":[],
                 "rationale":"근거 선택","rationaleTags":[]}
                """;
    }

    private String validIntent() {
        return """
                {"origin":{"displayName":"성수역","placeId":""},"destination":null,"startAt":"2026-09-09T13:30:00+09:00","totalMinutes":120,"requiredBikeCount":1,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """;
    }

    private String incompleteIntentWithoutClarification() {
        return """
                {"origin":null,"destination":null,"startAt":null,"totalMinutes":null,"requiredBikeCount":null,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """;
    }

    private void assertIntentProviderResponseNotRetried(
            int status,
            String body,
            JourneyAiErrorCode expectedCode
    ) throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        JourneyAiProperties properties = new JourneyAiProperties(true, null, "test-key", "test-model", Duration.ofSeconds(1));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(properties, mapper, JourneyAiSchemas.intent(mapper),
                new ResponsesApiClient(properties, mapper, request -> {
                    attempts.incrementAndGet();
                    return new ResponsesApiClient.TransportResponse(status, body);
                }));

        assertThatThrownBy(() -> gateway.compileIntent("성수에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(expectedCode);
        assertThat(attempts).hasValue(1);
    }

    private ConsumerAiEvidenceBundle.Evidence evidence(
            String id,
            Map<String, String> textFacts,
            Map<String, BigDecimal> numericFacts
    ) {
        return new ConsumerAiEvidenceBundle.Evidence(id, "test-source", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                OffsetDateTime.parse("2026-09-09T12:00:00+09:00"), textFacts, numericFacts);
    }

}
