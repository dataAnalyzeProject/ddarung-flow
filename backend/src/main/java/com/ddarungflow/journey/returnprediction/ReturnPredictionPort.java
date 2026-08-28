package com.ddarungflow.journey.returnprediction;

public interface ReturnPredictionPort {
    HealthResponse health(HealthRequest request);
    ReturnPredictionResult predict(PredictRequest request);
}
