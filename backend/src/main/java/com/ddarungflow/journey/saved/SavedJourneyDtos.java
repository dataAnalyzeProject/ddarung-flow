package com.ddarungflow.journey.saved;

import com.fasterxml.jackson.annotation.JsonAnySetter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class SavedJourneyDtos {
    private SavedJourneyDtos() { }

    public record SaveRequest(String displayName, PlaceInput origin, PlaceInput destination, Integer requiredBikeCount,
                              Integer totalJourneyMinutes, Integer maxJourneyMinutes, Map<String, String> preferences,
                              List<String> hardConstraints) { }

    public record ReplayInput(PlaceInput origin, PlaceInput destination, Integer requiredBikeCount,
                              Integer totalJourneyMinutes, Integer maxJourneyMinutes, Map<String, String> preferences,
                              List<String> hardConstraints) { }

    public record ReplayRequest(OffsetDateTime departureAt, Integer requiredBikeCount, Integer availableMinutes,
                                Integer maxJourneyMinutes, Map<String, String> preferences,
                                List<String> hardConstraints, List<String> themes, Integer stopCount,
                                String routeMode) {
        @JsonAnySetter
        public void rejectUnknownField(String name, Object value) {
            throw new IllegalArgumentException("지원하지 않는 replay 입력입니다: " + name);
        }
    }

    public record PlaceInput(String providerId, String displayName, BigDecimal latitude, BigDecimal longitude) { }

    public record SavedJourneyResponse(String savedJourneyId, String displayName, ReplayInput replayInput, String createdAt) { }

    public record ErrorResponse(String code) { }
}
