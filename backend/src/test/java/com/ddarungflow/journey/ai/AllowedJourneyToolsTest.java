package com.ddarungflow.journey.ai;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AllowedJourneyToolsTest {
    private final AllowedJourneyTools tools = new AllowedJourneyTools();

    @Test
    void acceptsOnlyReadOnlyAllowlistedTools() {
        assertThat(tools.validate(new ToolCallRequest("call-1", "resolve_places", Map.of("query", "성수"))).toolName())
                .isEqualTo("resolve_places");
        assertThatThrownBy(() -> tools.validate(new ToolCallRequest("call-2", "save_journey", Map.of())))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_NOT_ALLOWED);
    }

    @Test
    void rejectsNonJsonArguments() {
        assertThatThrownBy(() -> tools.validate(new ToolCallRequest("call-3", "resolve_places", Map.of("bad", new Object()))))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID);
    }
}
