package com.ddarungflow.journey.returnprediction;

import java.time.OffsetDateTime;

public record ReturnPredictionResult(Status status, Failure failure, Double selectedProbability,
                                     PredictResponse.Probabilities probabilities, OffsetDateTime featureAsOf,
                                     OffsetDateTime predictionTargetAt, String modelVersion, String dataQuality) {
    public enum Status { NORMAL, MISSING, UNAVAILABLE }
    public enum Failure { FEATURE_DISABLED, MODEL_NOT_CONFIGURED, TIMEOUT, CONNECTION_FAILURE, INVALID_REQUEST,
        PROVIDER_FAILURE, MALFORMED_RESPONSE, PROBABILITY_RANGE_VIOLATION, MONOTONICITY_VIOLATION,
        SELECTED_PROBABILITY_MISMATCH, STALE_RESPONSE }

    public static ReturnPredictionResult unavailable(Failure failure) {
        return new ReturnPredictionResult(Status.UNAVAILABLE, failure, null, null, null, null, null, null);
    }

    public static ReturnPredictionResult missing(OffsetDateTime featureAsOf, OffsetDateTime target, String modelVersion, String dataQuality) {
        return new ReturnPredictionResult(Status.MISSING, null, null, null, featureAsOf, target, modelVersion, dataQuality);
    }
}
