package com.ddarungflow.prediction;

import java.time.OffsetDateTime;

/**
 * 예측 대상 시각 계산 결과를 담는 불변 Record 객체.
 *
 * @param predictionTargetAt 계산된 목표 정시 시각 (floorToHour(arrivalAt + 30분))
 * @param targetOffsetMinutes arrivalAt 시각부터 predictionTargetAt까지의 차이 (분)
 * @param horizonMinutes featureAsOf 시각부터 predictionTargetAt까지의 차이 (분)
 * @param status 예측 서비스 가능 상태 (NORMAL, TOO_SOON, UNAVAILABLE)
 */
public record PredictionTimeResult(
    OffsetDateTime predictionTargetAt,
    long targetOffsetMinutes,
    long horizonMinutes,
    PredictionTimeStatus status
) {
}
