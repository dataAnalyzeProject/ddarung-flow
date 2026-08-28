package com.ddarungflow.journey.ai;

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
        validateValue(request.arguments());
        return request;
    }

    public Set<String> names() { return NAMES; }

    private void validateValue(Object value) {
        if (value == null || value instanceof String || value instanceof Boolean || value instanceof Integer || value instanceof Long || value instanceof Double) return;
        if (value instanceof Map<?, ?> map) { for (Map.Entry<?, ?> entry : map.entrySet()) { if (!(entry.getKey() instanceof String)) throw invalid(); validateValue(entry.getValue()); } return; }
        if (value instanceof Iterable<?> values) { for (Object item : values) validateValue(item); return; }
        throw invalid();
    }

    private JourneyAiException invalid() { return new JourneyAiException(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID, "tool arguments must be JSON-compatible"); }
}
