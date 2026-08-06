package com.ddarungflow.prediction;

import java.time.LocalDateTime;
import java.time.Duration;

public class PredictionTimeCalculator {

    private static final Duration MIN_LEAD_TIME = Duration.ofMinutes(10);
    private static final Duration MAX_PREDICTION_LIMIT = Duration.ofHours(24);

    /**
     * 예측 시간의 상태와 보정된 대상 시간을 계산합니다.
     * 요구사항에 따라 Spring 어노테이션은 일절 사용하지 않습니다.
     *
     * @param currentTime   현재 기준 시간
     * @param requestedTime 예측을 요청한 시간
     * @return 예측 상태, 요청 시간, 보정된 시간, 설명 메시지를 포함한 PredictionTimeResult 객체
     */
    public static PredictionTimeResult calculate(LocalDateTime currentTime, LocalDateTime requestedTime) {
        if (currentTime == null || requestedTime == null) {
            throw new IllegalArgumentException("Current time and requested time must not be null");
        }

        LocalDateTime calculatedTime = roundToNearest10Minutes(requestedTime);

        if (calculatedTime.isBefore(currentTime)) {
            return new PredictionTimeResult(
                PredictionTimeStatus.TOO_SOON,
                requestedTime,
                calculatedTime,
                "Requested time (rounded to " + calculatedTime + ") is in the past."
            );
        }

        Duration duration = Duration.between(currentTime, calculatedTime);

        if (duration.compareTo(MIN_LEAD_TIME) < 0) {
            return new PredictionTimeResult(
                PredictionTimeStatus.TOO_SOON,
                requestedTime,
                calculatedTime,
                "Prediction requires at least 10 minutes of lead time. Current lead time: " + duration.toMinutes() + " minute(s)."
            );
        }

        if (duration.compareTo(MAX_PREDICTION_LIMIT) > 0) {
            return new PredictionTimeResult(
                PredictionTimeStatus.UNAVAILABLE,
                requestedTime,
                calculatedTime,
                "Prediction is only available up to 24 hours in advance. Requested lead time: " + duration.toHours() + " hour(s)."
            );
        }

        return new PredictionTimeResult(
            PredictionTimeStatus.NORMAL,
            requestedTime,
            calculatedTime,
            "Prediction time is valid."
        );
    }

    /**
     * 입력받은 LocalDateTime 시간을 가장 가까운 10분 단위로 반올림(보정)합니다.
     * 예: 11:23:45 -> 11:20:00, 11:27:12 -> 11:30:00
     */
    public static LocalDateTime roundToNearest10Minutes(LocalDateTime time) {
        int minute = time.getMinute();
        int remainder = minute % 10;
        int roundedMinute;
        int hourAdjustment = 0;

        if (remainder < 5) {
            roundedMinute = minute - remainder;
        } else {
            roundedMinute = minute + (10 - remainder);
            if (roundedMinute == 60) {
                roundedMinute = 0;
                hourAdjustment = 1;
            }
        }

        LocalDateTime result = time.withMinute(roundedMinute).withSecond(0).withNano(0);
        if (hourAdjustment > 0) {
            result = result.plusHours(hourAdjustment);
        }
        return result;
    }
}
