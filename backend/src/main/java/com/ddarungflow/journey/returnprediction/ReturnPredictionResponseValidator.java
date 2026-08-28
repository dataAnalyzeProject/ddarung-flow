package com.ddarungflow.journey.returnprediction;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

final class ReturnPredictionResponseValidator {
    private final Clock clock;
    private final Duration maxResponseAge;

    ReturnPredictionResponseValidator(Clock clock, Duration maxResponseAge) {
        this.clock = clock;
        this.maxResponseAge = maxResponseAge;
    }

    ReturnPredictionResult.Failure validate(PredictRequest request, PredictResponse response) {
        if (response == null || response.status() == null || response.status().isBlank()
                || response.featureAsOf() == null || response.predictionTargetAt() == null) return ReturnPredictionResult.Failure.MALFORMED_RESPONSE;
        if (response.modelVersion() != null && response.modelVersion().isBlank()) return ReturnPredictionResult.Failure.MALFORMED_RESPONSE;
        if (response.dataQuality() != null && response.dataQuality().isBlank()) return ReturnPredictionResult.Failure.MALFORMED_RESPONSE;
        if (!request.stationId().equals(response.stationId())) return ReturnPredictionResult.Failure.STATION_ID_MISMATCH;
        OffsetDateTime requestedTarget = request.arrivalAt() != null ? request.arrivalAt() : request.predictionTargetAt();
        if (!response.predictionTargetAt().isEqual(requestedTarget)) return ReturnPredictionResult.Failure.PREDICTION_TARGET_MISMATCH;
        if (!response.featureAsOf().isEqual(request.featureAsOf()) || response.predictionTargetAt().isBefore(response.featureAsOf())
                || response.featureAsOf().isBefore(OffsetDateTime.now(clock).minus(maxResponseAge))) return ReturnPredictionResult.Failure.STALE_RESPONSE;
        if (!"NORMAL".equals(response.status())) return null;
        if (response.requiredEmptyDockCount() == null || !response.requiredEmptyDockCount().equals(request.requiredEmptyDockCount())
                || response.probabilities() == null || response.selectedProbability() == null) return ReturnPredictionResult.Failure.MALFORMED_RESPONSE;
        Double[] values = {response.probabilities().atLeast1(), response.probabilities().atLeast2(), response.probabilities().atLeast3(), response.probabilities().atLeast4(), response.probabilities().atLeast5()};
        for (Double value : values) if (value == null || !Double.isFinite(value) || value < 0 || value > 1) return ReturnPredictionResult.Failure.PROBABILITY_RANGE_VIOLATION;
        for (int index = 0; index < values.length - 1; index++) if (values[index] < values[index + 1]) return ReturnPredictionResult.Failure.MONOTONICITY_VIOLATION;
        if (Math.abs(response.selectedProbability() - values[request.requiredEmptyDockCount() - 1]) > 0.0000001) return ReturnPredictionResult.Failure.SELECTED_PROBABILITY_MISMATCH;
        return null;
    }
}
