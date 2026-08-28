package com.ddarungflow.journey.returnprediction;

import java.time.OffsetDateTime;

public record PredictRequest(String stationId, OffsetDateTime featureAsOf, OffsetDateTime arrivalAt,
                             OffsetDateTime predictionTargetAt, Integer horizonMinutes,
                             Integer requiredEmptyDockCount, Integer currentBikeCount, Integer capacity) {
    public String invalidField() {
        if (stationId == null || stationId.isBlank()) return "stationId";
        if (featureAsOf == null) return "featureAsOf";
        if (arrivalAt == null && predictionTargetAt == null) return "arrivalAt or predictionTargetAt";
        if (horizonMinutes == null || horizonMinutes <= 0) return "horizonMinutes";
        if (requiredEmptyDockCount == null || requiredEmptyDockCount < 1 || requiredEmptyDockCount > 5) return "requiredEmptyDockCount";
        if (currentBikeCount == null || currentBikeCount < 0) return "currentBikeCount";
        if (capacity == null || capacity <= 0 || currentBikeCount > capacity) return "capacity";
        return null;
    }
}
