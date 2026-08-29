package com.ddarungflow.journey.ai;

import java.time.OffsetDateTime;

/**
 * The allowlisted, non-sensitive form context that may accompany natural-language compilation.
 */
public record JourneyCompileRequest(
        String naturalLanguageText,
        PlaceReference origin,
        PlaceReference destination,
        OffsetDateTime departureAt,
        Integer maxJourneyMinutes,
        Integer requiredBikeCount
) { }
