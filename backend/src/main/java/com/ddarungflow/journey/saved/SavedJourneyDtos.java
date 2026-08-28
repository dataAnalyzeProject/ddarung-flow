package com.ddarungflow.journey.saved;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public final class SavedJourneyDtos {
    private SavedJourneyDtos() { }

    public record SaveRequest(String displayName, PlaceInput origin, PlaceInput destination, Integer requiredBikeCount,
                              Integer totalJourneyMinutes, Integer maxJourneyMinutes, Map<String, String> preferences,
                              List<String> hardConstraints) { }

    public record PlaceInput(String providerId, String displayName, BigDecimal latitude, BigDecimal longitude) { }

    public record SavedJourneyResponse(String savedJourneyId, String displayName, SaveRequest replayInput, String createdAt) { }

    public record ErrorResponse(String code) { }
}
