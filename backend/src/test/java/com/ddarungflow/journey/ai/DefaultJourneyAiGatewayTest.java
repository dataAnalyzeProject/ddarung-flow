package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

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
        OpenAiResponsesClient client = new OpenAiResponsesClient(properties, mapper,
                request -> new OpenAiResponsesClient.TransportResponse(200, completedResponseWithoutProviderMarker()));
        DefaultJourneyAiGateway gateway = new DefaultJourneyAiGateway(properties, mapper, providerSchema, client);

        assertThatThrownBy(() -> gateway.compileIntent("ORIGIN_A에서 출발"))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
    }

    private String completedResponseWithoutProviderMarker() throws Exception {
        String intent = """
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A"},"destination":null,"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """;
        return """
                {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":%s}]}]}
                """.formatted(mapper.writeValueAsString(intent));
    }
}
