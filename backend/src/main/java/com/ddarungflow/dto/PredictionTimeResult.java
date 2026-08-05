package com.ddarungflow.dto;

import java.time.LocalDateTime;

public record PredictionTimeResult(
    LocalDateTime predictionTargetAt,
    long targetOffsetMinutes,
    long horizonMinutes,
    PredictionStatus status
) {
    public enum PredictionStatus {
        NORMAL,
        TOO_SOON,
        UNAVAILABLE
    }
}
