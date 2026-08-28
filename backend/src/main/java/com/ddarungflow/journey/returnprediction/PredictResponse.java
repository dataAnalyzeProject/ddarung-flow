package com.ddarungflow.journey.returnprediction;

import java.time.OffsetDateTime;

public record PredictResponse(String stationId, OffsetDateTime arrivalAt, OffsetDateTime predictionTargetAt,
                              Integer requiredEmptyDockCount, Double selectedProbability, Probabilities probabilities,
                              String status, OffsetDateTime featureAsOf, String modelVersion, String dataQuality,
                              String errorCode) {
    public record Probabilities(Double atLeast1, Double atLeast2, Double atLeast3, Double atLeast4, Double atLeast5) { }
}
