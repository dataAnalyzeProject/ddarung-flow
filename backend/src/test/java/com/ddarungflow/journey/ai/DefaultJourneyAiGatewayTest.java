package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

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

        assertThat(gateway.validateToolPlan(List.of(new ToolCallRequest("tool-1", "get_cycle_routes", Map.of("origin", "ORIGIN_A")))))
                .extracting(ToolCallRequest::callId)
                .containsExactly("tool-1");
    }
}
