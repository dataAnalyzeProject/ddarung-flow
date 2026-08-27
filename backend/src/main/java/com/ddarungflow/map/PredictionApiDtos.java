package com.ddarungflow.map;

import com.ddarungflow.inventory.InventoryStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public class PredictionApiDtos {

    public enum AvailabilityLevel {
        HIGH,
        MEDIUM,
        LOW
    }

    public enum PredictionStatus {
        NORMAL,
        MISSING,
        UNAVAILABLE,
        TOO_SOON
    }

    public record PredictionDirectRequestDto(
        String stationId,
        BigDecimal originLatitude,
        BigDecimal originLongitude,
        String travelMode,
        Integer minutesAhead,
        Integer requiredBikeCount
    ) {}

    public record QuantityProbabilities(
        BigDecimal atLeast1,
        BigDecimal atLeast2,
        BigDecimal atLeast3,
        BigDecimal atLeast4,
        BigDecimal atLeast5
    ) {}

    public record HorizonOutlook(
        long horizonMinutes,
        OffsetDateTime predictionTargetAt,
        BigDecimal probability,
        AvailabilityLevel availabilityLevel,
        boolean isSelected
    ) {}

    public record CandidatePredictionResponseDto(
        String stationId,
        String stationName,
        BigDecimal latitude,
        BigDecimal longitude,
        int distanceMeters,
        int durationSeconds,
        Integer availableBikeCount,
        InventoryStatus inventoryStatus,
        OffsetDateTime inventoryCollectedAt,
        BigDecimal predictionProbability,
        QuantityProbabilities probabilities,
        Integer requiredBikeCount,
        OffsetDateTime arrivalAt,
        OffsetDateTime predictionTargetAt,
        long targetOffsetMinutes,
        long horizonMinutes,
        OffsetDateTime featureAsOf,
        OffsetDateTime expiresAt,
        AvailabilityLevel availabilityLevel,
        PredictionStatus predictionStatus,
        String modelVersion,
        OffsetDateTime generatedAt,
        java.util.List<HorizonOutlook> horizonOutlook
    ) {
        public CandidatePredictionResponseDto(
            String stationId, String stationName, BigDecimal latitude, BigDecimal longitude, int distanceMeters,
            int durationSeconds, Integer availableBikeCount, InventoryStatus inventoryStatus,
            OffsetDateTime inventoryCollectedAt, BigDecimal predictionProbability, QuantityProbabilities probabilities,
            Integer requiredBikeCount, OffsetDateTime arrivalAt, OffsetDateTime predictionTargetAt,
            long targetOffsetMinutes, long horizonMinutes, OffsetDateTime featureAsOf, OffsetDateTime expiresAt,
            AvailabilityLevel availabilityLevel, PredictionStatus predictionStatus, String modelVersion,
            OffsetDateTime generatedAt
        ) {
            this(stationId, stationName, latitude, longitude, distanceMeters, durationSeconds, availableBikeCount,
                inventoryStatus, inventoryCollectedAt, predictionProbability, probabilities, requiredBikeCount,
                arrivalAt, predictionTargetAt, targetOffsetMinutes, horizonMinutes, featureAsOf, expiresAt,
                availabilityLevel, predictionStatus, modelVersion, generatedAt, null);
        }
    }
}
