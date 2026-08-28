package com.ddarungflow.journey.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AllowedJourneyTools {
    private static final Set<String> NAMES = Set.of(
            "resolve_places", "get_rental_candidates", "get_cycle_routes", "get_destination_candidates",
            "get_return_candidates", "simulate_journey", "rank_journeys", "get_next_best_question", "compare_counterfactual"
    );

    public ToolCallRequest validate(ToolCallRequest request) {
        if (!NAMES.contains(request.toolName())) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_NOT_ALLOWED, "tool is not allowlisted");
        }
        Map<String, ToolArgumentType> expected = definitions().get(request.toolName());
        Map<String, ToolArgument> actual = new LinkedHashMap<>();
        for (ToolArgument argument : request.arguments()) {
            if (actual.put(argument.name(), argument) != null || expected.get(argument.name()) != argument.type()) throw invalid();
        }
        if (!actual.keySet().equals(expected.keySet())) throw invalid();
        return request;
    }

    public Set<String> names() { return NAMES; }

    private Map<String, Map<String, ToolArgumentType>> definitions() {
        return Map.of(
                "resolve_places", Map.of("query", ToolArgumentType.STRING),
                "get_rental_candidates", Map.of("originPlaceId", ToolArgumentType.STRING, "departureAt", ToolArgumentType.STRING, "requiredBikeCount", ToolArgumentType.INTEGER),
                "get_cycle_routes", Map.of("originPlaceId", ToolArgumentType.STRING, "destinationPlaceId", ToolArgumentType.STRING),
                "get_destination_candidates", Map.of("originPlaceId", ToolArgumentType.STRING, "startAt", ToolArgumentType.STRING, "totalMinutes", ToolArgumentType.INTEGER),
                "get_return_candidates", Map.of("destinationPlaceId", ToolArgumentType.STRING, "arrivalAt", ToolArgumentType.STRING, "requiredBikeCount", ToolArgumentType.INTEGER),
                "simulate_journey", Map.of("candidateIds", ToolArgumentType.STRING_ARRAY, "scenario", ToolArgumentType.STRING),
                "rank_journeys", Map.of("candidateIds", ToolArgumentType.STRING_ARRAY),
                "get_next_best_question", Map.of("candidateIds", ToolArgumentType.STRING_ARRAY),
                "compare_counterfactual", Map.of("candidateIds", ToolArgumentType.STRING_ARRAY)
        );
    }

    private JourneyAiException invalid() { return new JourneyAiException(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID, "tool arguments must be JSON-compatible"); }
}
