package com.ddarungflow.prediction;

import java.time.OffsetDateTime;
import java.time.Duration;
import java.time.temporal.ChronoUnit;

public final class PredictionTimeCalculator {

    // 인스턴스화 방지를 위한 private 생성자
    private PredictionTimeCalculator() {}

    /**
     * 예측 시간 상태 및 보정된 목표 시각과의 분 차이를 계산합니다.
     * Spring 어노테이션은 어떠한 경우에도 사용하지 않습니다.
     *
     * @param requestedAt 예측 요청 시각
     * @param arrivalAt   도착 예정 시각
     * @param featureAsOf 피처 기준 시각
     * @return 계산 결과를 포함한 PredictionTimeResult 객체
     */
    public static PredictionTimeResult calculate(OffsetDateTime requestedAt, OffsetDateTime arrivalAt, OffsetDateTime featureAsOf) {
        if (requestedAt == null || arrivalAt == null || featureAsOf == null) {
            throw new IllegalArgumentException("모든 입력 값(requestedAt, arrivalAt, featureAsOf)은 null이 될 수 없습니다.");
        }

        // 목표 시각 계산: arrivalAt + 30분 후 정시(정각)로 자름
        OffsetDateTime predictionTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        // 분 차이 계산 (arrivalAt -> 목표 시각, featureAsOf -> 목표 시각)
        long targetOffsetMinutes = Duration.between(arrivalAt, predictionTargetAt).toMinutes();
        long horizonMinutes = Duration.between(featureAsOf, predictionTargetAt).toMinutes();

        PredictionTimeStatus status;

        // 목표 시각이 요청 시각과 같거나 이전인 경우
        if (!predictionTargetAt.isAfter(requestedAt)) {
            status = PredictionTimeStatus.TOO_SOON;
        } else {
            // 미래 목표이면서 horizon이 60, 120, 180, 240 중 하나면 NORMAL, 그 외에는 UNAVAILABLE
            if (horizonMinutes == 60 || horizonMinutes == 120 || horizonMinutes == 180 || horizonMinutes == 240) {
                status = PredictionTimeStatus.NORMAL;
            } else {
                status = PredictionTimeStatus.UNAVAILABLE;
            }
        }

        return new PredictionTimeResult(
            predictionTargetAt,
            targetOffsetMinutes,
            horizonMinutes,
            status
        );
    }
}
