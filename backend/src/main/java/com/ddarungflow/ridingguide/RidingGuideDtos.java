package com.ddarungflow.ridingguide;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.util.List;

public final class RidingGuideDtos {
    private RidingGuideDtos() { }

    public record Request(
            String stationId,
            String journeyDecisionId,
            BigDecimal originLatitude,
            BigDecimal originLongitude,
            Integer minutesAhead,
            Integer requiredBikeCount,
            String poiTheme,
            Integer poiLimit
    ) { }

    public enum Status { NORMAL, PARTIAL }
    public enum AiStatus { AVAILABLE, PARTIAL, UNAVAILABLE }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Response(
            String stationId,
            Status status,
            AiStatus aiStatus,
            String aiCode,
            ConsumerAiEvidenceBundle evidence,
            String guideSummary,
            List<ItineraryStop> itineraryPreview,
            String rationale,
            List<String> rationaleTags,
            List<String> warnings
    ) {
        public Response {
            itineraryPreview = itineraryPreview == null ? List.of() : List.copyOf(itineraryPreview);
            rationaleTags = rationaleTags == null ? List.of() : List.copyOf(rationaleTags);
            warnings = warnings == null ? List.of() : List.copyOf(warnings);
        }
    }

    public record ItineraryStop(String poiId, int stayMinutes, String rationale) { }
}
