package com.ddarungflow.journey.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Stored Journey output. Fields that are outside the current WALK rental scope
 * stay null rather than being represented as a made-up zero.
 */
public record JourneyCandidate(
        String candidateId,
        JourneyArchetype archetype,
        int rank,
        BigDecimal rentalProbability,
        BigDecimal returnProbability,
        Integer cyclingMinutes,
        Integer distanceMeters,
        Integer elevationMeters,
        Integer bikeLanePercent,
        String destinationName,
        String destinationCategory,
        String advantage,
        String tradeoff,
        String stationId,
        String stationName,
        BigDecimal latitude,
        BigDecimal longitude,
        Integer requiredBikeCount,
        Integer availableBikeCount,
        String inventoryStatus,
        OffsetDateTime inventoryCollectedAt,
        String availabilityLevel,
        Integer accessDurationSeconds,
        OffsetDateTime arrivalAt,
        OffsetDateTime predictionTargetAt,
        Long horizonMinutes,
        OffsetDateTime featureAsOf,
        String modelVersion,
        OffsetDateTime generatedAt,
        String predictionStatus
) {
    public JourneyCandidate(String candidateId, JourneyArchetype archetype, int rank,
                            BigDecimal rentalProbability, BigDecimal returnProbability,
                            Integer cyclingMinutes, Integer distanceMeters,
                            Integer elevationMeters, Integer bikeLanePercent,
                            String destinationName, String destinationCategory,
                            String advantage, String tradeoff) {
        this(candidateId, archetype, rank, rentalProbability, returnProbability, cyclingMinutes, distanceMeters,
                elevationMeters, bikeLanePercent, destinationName, destinationCategory, advantage, tradeoff,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }
}
