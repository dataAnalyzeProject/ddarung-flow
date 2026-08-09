package com.ddarungflow.prediction;

import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

public class PredictionTimeCalculatorTest {

    private final PredictionTimeCalculator calculator = new PredictionTimeCalculator();

    // 기본 시간 상수 (KST: UTC+9)
    private final OffsetDateTime baseRequestedAt = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));
    private final OffsetDateTime baseFeatureAsOf = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));

    @Test
    public void testCase1() {
        OffsetDateTime requestedAt = OffsetDateTime.of(2026, 8, 6, 15, 1, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 29, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));

        PredictionTimeResult result = calculator.calculate(requestedAt, arrivalAt, featureAsOf);

        assertEquals(OffsetDateTime.of(2026, 8, 6, 15, 0, 0, 0, ZoneOffset.ofHours(9)), result.predictionTargetAt());
        assertEquals(-29, result.targetOffsetMinutes());
        assertEquals(60, result.horizonMinutes());
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
    }

    @Test
    public void testCase2() {
        OffsetDateTime requestedAt = OffsetDateTime.of(2026, 8, 6, 15, 1, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 30, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 6, 15, 0, 0, 0, ZoneOffset.ofHours(9));

        PredictionTimeResult result = calculator.calculate(requestedAt, arrivalAt, featureAsOf);

        assertEquals(OffsetDateTime.of(2026, 8, 6, 16, 0, 0, 0, ZoneOffset.ofHours(9)), result.predictionTargetAt());
        assertEquals(30, result.targetOffsetMinutes());
        assertEquals(60, result.horizonMinutes());
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }

    @Test
    public void testCase3() {
        OffsetDateTime requestedAt = OffsetDateTime.of(2026, 8, 6, 15, 1, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 41, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 6, 15, 0, 0, 0, ZoneOffset.ofHours(9));

        PredictionTimeResult result = calculator.calculate(requestedAt, arrivalAt, featureAsOf);

        assertEquals(OffsetDateTime.of(2026, 8, 6, 16, 0, 0, 0, ZoneOffset.ofHours(9)), result.predictionTargetAt());
        assertEquals(19, result.targetOffsetMinutes());
        assertEquals(60, result.horizonMinutes());
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }

    @Test
    public void testHorizonNormals() {
        // horizonMinutes가 60, 120, 180, 240 중 하나일 때 NORMAL 검증
        long[] validHorizons = {60, 120, 180, 240};

        for (long horizon : validHorizons) {
            // arrivalAt는 15:30으로 고정하여 목표 시각을 16:00으로 설정 (offset = 30분)
            OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 30, 0, 0, ZoneOffset.ofHours(9));
            // featureAsOf를 조정하여 원하는 horizonMinutes 생성
            OffsetDateTime featureAsOf = arrivalAt.plusMinutes(30).minusMinutes(horizon); // 16:00 - horizon

            PredictionTimeResult result = calculator.calculate(baseRequestedAt, arrivalAt, featureAsOf);
            assertEquals(horizon, result.horizonMinutes());
            assertEquals(PredictionTimeStatus.NORMAL, result.status());
        }
    }

    @Test
    public void testHorizonUnavailable_300() {
        // horizon 300분 (5시간) 일 때 UNAVAILABLE 검증
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 30, 0, 0, ZoneOffset.ofHours(9)); // 목표 16:00
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 6, 11, 0, 0, 0, ZoneOffset.ofHours(9)); // 11:00 -> 16:00 = 300분

        PredictionTimeResult result = calculator.calculate(baseRequestedAt, arrivalAt, featureAsOf);
        assertEquals(300, result.horizonMinutes());
        assertEquals(PredictionTimeStatus.UNAVAILABLE, result.status());
    }

    @Test
    public void testTargetTimeEqualToRequestedTime_TooSoon() {
        // 목표 시각과 요청 시각이 동일한 경우 -> TOO_SOON
        // 도착 시각 14:00 (14:00 + 30분 = 14:30 -> 14:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));

        PredictionTimeResult result = calculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        assertEquals(baseRequestedAt, result.predictionTargetAt()); // 목표 시각 14:00 == 요청 시각 14:00
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
    }

    @Test
    public void testTargetTimeBeforeRequestedTime_TooSoon() {
        // 목표 시각이 요청 시각 이전인 경우 -> TOO_SOON
        // 도착 시각 13:29 (13:29 + 30분 = 13:59 -> 13:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 13, 29, 0, 0, ZoneOffset.ofHours(9));

        PredictionTimeResult result = calculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        assertTrue(result.predictionTargetAt().isBefore(baseRequestedAt)); // 목표 시각 13:00 < 요청 시각 14:00
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
    }

    @Test
    public void testNullInputsThrowException() {
        assertThrows(IllegalArgumentException.class, () -> {
            calculator.calculate(null, baseRequestedAt, baseFeatureAsOf);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            calculator.calculate(baseRequestedAt, null, baseFeatureAsOf);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            calculator.calculate(baseRequestedAt, baseRequestedAt, null);
        });
    }

    @Test
    public void testUtcOffsetMismatch() {
        OffsetDateTime requestedAt = OffsetDateTime.of(2026, 8, 6, 15, 1, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 30, 0, 0, ZoneOffset.ofHours(9));
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 6, 15, 0, 0, 0, ZoneOffset.ofHours(0));

        assertThrows(IllegalArgumentException.class, () -> {
            calculator.calculate(requestedAt, arrivalAt, featureAsOf);
        });
    }
}
