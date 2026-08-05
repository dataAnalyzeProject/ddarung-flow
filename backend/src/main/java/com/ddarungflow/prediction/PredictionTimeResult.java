package com.ddarungflow.prediction;

import java.time.LocalDateTime;

public record PredictionTimeResult(
    LocalDateTime predictionTargetAt,
    long targetOffsetMinutes,
    long horizonMinutes,
    PredictionTimeStatus status
) {
}
