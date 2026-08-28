package com.ddarungflow.journey.returnprediction;

public record HealthResponse(String serviceStatus, String modelStatus, boolean ready) { }
