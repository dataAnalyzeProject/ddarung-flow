package com.ddarungflow.prediction;

import java.time.OffsetDateTime;

public record PredictionTimeResult(
    OffsetDateTime predictionTargetAt,
    long targetOffsetMinutes,
    long horizonMinutes,
    PredictionTimeStatus status
) {}
