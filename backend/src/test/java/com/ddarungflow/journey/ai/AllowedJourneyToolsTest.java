package com.ddarungflow.journey.ai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AllowedJourneyToolsTest {
    private final AllowedJourneyTools tools = new AllowedJourneyTools();

    @Test
    void acceptsOnlyReadOnlyAllowlistedTools() {
        assertThat(tools.validate(new ToolCallRequest("call-1", "resolve_places", List.of(string("query", "성수")))).toolName())
                .isEqualTo("resolve_places");
        assertThatThrownBy(() -> tools.validate(new ToolCallRequest("call-2", "save_journey", List.of())))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_NOT_ALLOWED);
    }

    @Test
    void rejectsUnknownFieldsAndWrongTypes() {
        assertThatThrownBy(() -> tools.validate(new ToolCallRequest("call-3", "resolve_places", List.of(string("extra", "no")))))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID);
        assertThatThrownBy(() -> tools.validate(new ToolCallRequest("call-4", "resolve_places", List.of(new ToolArgument("query", ToolArgumentType.INTEGER, 1)))))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID);
    }

    @Test
    void validatesEveryAllowlistedToolAgainstItsStrictArguments() {
        assertValid("get_rental_candidates", string("originPlaceId", "ORIGIN_A"), string("departureAt", "2026-08-28T18:30:00+09:00"), integer("requiredBikeCount", 2));
        assertValid("get_cycle_routes", string("originPlaceId", "ORIGIN_A"), string("destinationPlaceId", "DESTINATION_B"));
        assertValid("get_destination_candidates", string("originPlaceId", "ORIGIN_A"), string("startAt", "2026-08-28T18:30:00+09:00"), integer("totalMinutes", 60));
        assertValid("get_return_candidates", string("destinationPlaceId", "DESTINATION_B"), string("arrivalAt", "2026-08-28T19:30:00+09:00"), integer("requiredBikeCount", 2));
        assertValid("simulate_journey", strings("candidateIds", "JRN-A"), string("scenario", "RAIN"));
        assertValid("rank_journeys", strings("candidateIds", "JRN-A"));
        assertValid("get_next_best_question", strings("candidateIds", "JRN-A"));
        assertValid("compare_counterfactual", strings("candidateIds", "JRN-A"));
    }

    private ToolArgument string(String name, String value) { return new ToolArgument(name, ToolArgumentType.STRING, value); }
    private ToolArgument integer(String name, int value) { return new ToolArgument(name, ToolArgumentType.INTEGER, value); }
    private ToolArgument strings(String name, String value) { return new ToolArgument(name, ToolArgumentType.STRING_ARRAY, List.of(value)); }
    private void assertValid(String name, ToolArgument... arguments) { assertThat(tools.validate(new ToolCallRequest("call-" + name, name, List.of(arguments))).toolName()).isEqualTo(name); }
}
