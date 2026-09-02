package com.ddarungflow.journey.domain;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record UnifiedJourneyPlan(
        Status status,
        String selectedRentalCandidateId,
        ConsumerAiEvidenceBundle evidence,
        List<Segment> segments,
        String rationale,
        List<String> rationaleTags,
        List<String> warnings
) {
    public UnifiedJourneyPlan {
        segments = segments == null ? List.of() : List.copyOf(segments);
        rationaleTags = rationaleTags == null ? List.of() : List.copyOf(rationaleTags);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    public enum Status { READY, PARTIAL, UNAVAILABLE }
    public enum SegmentType { ACCESS, RENT, RIDE, VISIT }

    public record Segment(
            String segmentId,
            SegmentType type,
            String fromEvidenceId,
            String toEvidenceId,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            Integer durationSeconds,
            Integer distanceMeters,
            String travelMode,
            String routeMode,
            List<RoutePoint> pathPoints,
            Integer stayMinutes,
            RentalFacts rentalFacts
    ) {
        public Segment {
            pathPoints = pathPoints == null ? List.of() : List.copyOf(pathPoints);
        }
    }

    public record RoutePoint(BigDecimal latitude, BigDecimal longitude) { }

    public record RentalFacts(
            String stationId,
            String stationName,
            BigDecimal rentalProbability,
            Integer requiredBikeCount,
            Integer availableBikeCount,
            String inventoryStatus,
            OffsetDateTime inventoryCollectedAt,
            String predictionStatus,
            OffsetDateTime predictionTargetAt,
            OffsetDateTime featureAsOf,
            String modelVersion,
            OffsetDateTime generatedAt
    ) { }
}
