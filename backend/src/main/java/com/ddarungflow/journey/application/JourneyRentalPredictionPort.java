package com.ddarungflow.journey.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Narrow Journey-facing boundary for the existing consumer rental prediction. */
public interface JourneyRentalPredictionPort {
    List<RentalCandidate> predict(RentalPredictionRequest request);

    record RentalPredictionRequest(
            BigDecimal originLatitude,
            BigDecimal originLongitude,
            BigDecimal destinationLatitude,
            BigDecimal destinationLongitude,
            OffsetDateTime departureAt,
            int requiredBikeCount
    ) { }

    record RentalCandidate(
            String stationId,
            String stationName,
            BigDecimal latitude,
            BigDecimal longitude,
            Integer availableBikeCount,
            String inventoryStatus,
            OffsetDateTime inventoryCollectedAt,
            BigDecimal rentalProbability,
            Integer requiredBikeCount,
            String availabilityLevel,
            Integer distanceMeters,
            Integer durationSeconds,
            OffsetDateTime arrivalAt,
            OffsetDateTime predictionTargetAt,
            Long horizonMinutes,
            OffsetDateTime featureAsOf,
            String modelVersion,
            OffsetDateTime generatedAt,
            String predictionStatus
    ) { }
}
