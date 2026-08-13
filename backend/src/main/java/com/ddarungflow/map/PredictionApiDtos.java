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
        UNAVAILABLE
    }

    public record PredictionDirectRequestDto(
        String stationId,
        BigDecimal originLatitude,
        BigDecimal originLongitude,
        String travelMode,
        Integer minutesAhead,
        Integer requiredBikeCount
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
        BigDecimal predictionProbability,
        OffsetDateTime predictionTargetAt,
        AvailabilityLevel availabilityLevel,
        PredictionStatus predictionStatus,
        String modelVersion,
        OffsetDateTime generatedAt
    ) {}
}
