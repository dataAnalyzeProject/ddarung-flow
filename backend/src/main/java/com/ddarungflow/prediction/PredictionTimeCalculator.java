package com.ddarungflow.prediction;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Set;

/**
 * 사용자 도착 시각과 기준 시각을 바탕으로 목표 예측 정시, 오프셋, Horizon 및 가능 상태를 계산하는 순수 자바 계산기 클래스.
 * Spring 어노테이션에 의존하지 않는 독립적인 순수 도메인 로직으로 구현되었습니다.
 */
public final class PredictionTimeCalculator {

    /**
     * NORMAL 상태로 제공 가능한 지원 Horizon 분 목록 (60, 120, 180, 240분)
     */
    private static final Set<Long> VALID_HORIZONS = Set.of(60L, 120L, 180L, 240L);

    /**
     * 예측 목표 시각, 타겟 오프셋, Horizon, 예측 가능 상태를 8단계 표준 규칙에 따라 계산합니다.
     *
     * @param requestedAt 요청 발생 시각
     * @param arrivalAt 도착 예정 시각
     * @param featureAsOf 피처 산출 기준 시각
     * @return 예측 시각 계산 결과 (PredictionTimeResult)
     */
    public PredictionTimeResult calculate(OffsetDateTime requestedAt, OffsetDateTime arrivalAt, OffsetDateTime featureAsOf) {
        // Step 1. 입력값 Null 및 UTC Offset 일치 여부 검증
        if (requestedAt == null || arrivalAt == null || featureAsOf == null) {
            throw new IllegalArgumentException("requestedAt, arrivalAt, and featureAsOf must not be null");
        }
        if (!requestedAt.getOffset().equals(arrivalAt.getOffset()) || !requestedAt.getOffset().equals(featureAsOf.getOffset())) {
            throw new IllegalArgumentException("All timestamps must have matching UTC offsets");
        }

        // Step 2. arrivalAt + 30분을 계산한 후 정시(Hour) 단위로 절삭하여 목표 정시 시각(predictionTargetAt) 산출
        // (예: 15:29 + 30m = 15:59 -> 15:00, 15:30 + 30m = 16:00 -> 16:00)
        OffsetDateTime predictionTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        // Step 3. arrivalAt 시각부터 predictionTargetAt 시각까지의 offset 분 계산
        long targetOffsetMinutes = ChronoUnit.MINUTES.between(arrivalAt, predictionTargetAt);

        // Step 4. featureAsOf 시각부터 predictionTargetAt 시각까지의 horizon 분 계산
        long horizonMinutes = ChronoUnit.MINUTES.between(featureAsOf, predictionTargetAt);

        // Step 5~7. 예측 가능 상태(PredictionTimeStatus) 판정
        PredictionTimeStatus status;
        if (!predictionTargetAt.isAfter(requestedAt)) {
            // Step 5. 목표 정시가 requestedAt 시각보다 늦지 않은 경우 (과거이거나 현재 정시와 같음) -> TOO_SOON
            status = PredictionTimeStatus.TOO_SOON;
        } else if (VALID_HORIZONS.contains(horizonMinutes)) {
            // Step 6. 미래 target의 horizon이 60, 120, 180, 240분 중 하나인 경우 -> NORMAL
            status = PredictionTimeStatus.NORMAL;
        } else {
            // Step 7. 그 외의 미래 horizon인 경우 -> UNAVAILABLE (가까운 지평값으로 반올림하지 않음)
            status = PredictionTimeStatus.UNAVAILABLE;
        }

        return new PredictionTimeResult(predictionTargetAt, targetOffsetMinutes, horizonMinutes, status);
    }
}
