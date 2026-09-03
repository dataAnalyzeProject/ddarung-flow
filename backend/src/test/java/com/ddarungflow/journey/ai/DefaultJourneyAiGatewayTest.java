package com.ddarungflow.journey.ai;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import java.time.Duration;
import java.util.List;
import java.util.Map;
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
}
