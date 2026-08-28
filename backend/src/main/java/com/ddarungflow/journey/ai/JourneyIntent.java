package com.ddarungflow.journey.ai;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Collections;
import java.util.LinkedHashMap;

public record JourneyIntent(
        PlaceReference origin,
        PlaceReference destination,
        OffsetDateTime startAt,
        Integer totalMinutes,
        Integer requiredBikeCount,
        Map<String, Integer> preferences,
        Map<String, Object> hardConstraints,
        List<String> missingFields,
        boolean needsClarification
) {
    public JourneyIntent {
        preferences = preferences == null ? Map.of() : Map.copyOf(preferences);
        hardConstraints = hardConstraints == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(hardConstraints));
        missingFields = missingFields == null ? List.of() : List.copyOf(missingFields);
        if (requiredBikeCount != null && (requiredBikeCount < 1 || requiredBikeCount > 5)) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "requiredBikeCount must be between 1 and 5");
        }
        if (!needsClarification && !missingFields.isEmpty()) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "missing fields require clarification");
        }
    }
}
