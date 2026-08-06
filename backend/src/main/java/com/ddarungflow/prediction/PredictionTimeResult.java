package com.ddarungflow.prediction;

import java.time.LocalDateTime;

public record PredictionTimeResult(
    PredictionTimeStatus status,
    LocalDateTime requestedTime,
    LocalDateTime calculatedTime,
    String message
) {}
