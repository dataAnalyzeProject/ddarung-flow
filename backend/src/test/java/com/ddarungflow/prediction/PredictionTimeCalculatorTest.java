package com.ddarungflow.prediction;

import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

public class PredictionTimeCalculatorTest {

    // 기본 시간 상수 (KST: UTC+9)
    private final OffsetDateTime baseRequestedAt = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));
    private final OffsetDateTime baseFeatureAsOf = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));

    @Test
    public void testArrivalTime_15_29() {
        // 도착 시각 15:29 (15:29 + 30분 = 15:59 -> 15:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 29, 0, 0, ZoneOffset.ofHours(9));
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        
        // 15:00은 요청 시각(14:00)보다 미래이므로, horizon = 60분 (14:00 -> 15:00) -> NORMAL
        assertEquals(OffsetDateTime.of(2026, 8, 6, 15, 0, 0, 0, ZoneOffset.ofHours(9)), result.predictionTargetAt());
        assertEquals(-29, result.targetOffsetMinutes()); // 15:29 -> 15:00 (-29분)
        assertEquals(60, result.horizonMinutes()); // 14:00 -> 15:00 (60분)
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }

    @Test
    public void testArrivalTime_Exactly_15_30() {
        // 도착 시각 15:30 (15:30 + 30분 = 16:00 -> 16:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 30, 0, 0, ZoneOffset.ofHours(9));
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        
        // 16:00은 요청 시각(14:00)보다 미래이며, horizon = 120분 (14:00 -> 16:00) -> NORMAL
        assertEquals(OffsetDateTime.of(2026, 8, 6, 16, 0, 0, 0, ZoneOffset.ofHours(9)), result.predictionTargetAt());
        assertEquals(30, result.targetOffsetMinutes()); // 15:30 -> 16:00 (30분)
        assertEquals(120, result.horizonMinutes()); // 14:00 -> 16:00 (120분)
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }

    @Test
    public void testArrivalTime_15_41() {
        // 도착 시각 15:41 (15:41 + 30분 = 16:11 -> 16:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 41, 0, 0, ZoneOffset.ofHours(9));
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        
        // 16:00은 요청 시각(14:00)보다 미래이며, horizon = 120분 (14:00 -> 16:00) -> NORMAL
        assertEquals(OffsetDateTime.of(2026, 8, 6, 16, 0, 0, 0, ZoneOffset.ofHours(9)), result.predictionTargetAt());
        assertEquals(19, result.targetOffsetMinutes()); // 15:41 -> 16:00 (19분)
        assertEquals(120, result.horizonMinutes()); // 14:00 -> 16:00 (120분)
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
            
            PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, featureAsOf);
            assertEquals(horizon, result.horizonMinutes());
            assertEquals(PredictionTimeStatus.NORMAL, result.status());
        }
    }

    @Test
    public void testHorizonUnavailable_300() {
        // horizon 300분 (5시간) 일 때 UNAVAILABLE 검증
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 15, 30, 0, 0, ZoneOffset.ofHours(9)); // 목표 16:00
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 6, 11, 0, 0, 0, ZoneOffset.ofHours(9)); // 11:00 -> 16:00 = 300분
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, featureAsOf);
        assertEquals(300, result.horizonMinutes());
        assertEquals(PredictionTimeStatus.UNAVAILABLE, result.status());
    }

    @Test
    public void testTargetTimeEqualToRequestedTime_TooSoon() {
        // 목표 시각과 요청 시각이 동일한 경우 -> TOO_SOON
        // 도착 시각 14:00 (14:00 + 30분 = 14:30 -> 14:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 14, 0, 0, 0, ZoneOffset.ofHours(9));
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        assertEquals(baseRequestedAt, result.predictionTargetAt()); // 목표 시각 14:00 == 요청 시각 14:00
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
    }

    @Test
    public void testTargetTimeBeforeRequestedTime_TooSoon() {
        // 목표 시각이 요청 시각 이전인 경우 -> TOO_SOON
        // 도착 시각 13:29 (13:29 + 30분 = 13:59 -> 13:00으로 잘림)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 6, 13, 29, 0, 0, ZoneOffset.ofHours(9));
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseRequestedAt, arrivalAt, baseFeatureAsOf);
        assertTrue(result.predictionTargetAt().isBefore(baseRequestedAt)); // 목표 시각 13:00 < 요청 시각 14:00
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
    }

    @Test
    public void testNullInputsThrowException() {
        assertThrows(IllegalArgumentException.class, () -> {
            PredictionTimeCalculator.calculate(null, baseRequestedAt, baseFeatureAsOf);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            PredictionTimeCalculator.calculate(baseRequestedAt, null, baseFeatureAsOf);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            PredictionTimeCalculator.calculate(baseRequestedAt, baseRequestedAt, null);
        });
    }

    @Test
    public void testUtcOffsetMismatch() {
        // UTC offset이 불일치해도 순간(Instant)을 기준으로 분 계산 및 비교가 정확히 동작하는지 검증
        // KST의 14:00:00+09:00 은 UTC의 05:00:00Z 와 같음
        OffsetDateTime requestedAtUtc = OffsetDateTime.of(2026, 8, 6, 5, 0, 0, 0, ZoneOffset.UTC); // 14:00 KST
        
        // KST의 15:30:00+09:00 은 UTC의 06:30:00Z 와 같음 (목표 시각은 16:00 KST = 07:00 UTC)
        OffsetDateTime arrivalAtUtc = OffsetDateTime.of(2026, 8, 6, 6, 30, 0, 0, ZoneOffset.UTC); // 15:30 KST
        
        // KST의 14:00:00+09:00 은 UTC의 05:00:00Z 와 같음
        OffsetDateTime featureAsOfUtc = OffsetDateTime.of(2026, 8, 6, 5, 0, 0, 0, ZoneOffset.UTC); // 14:00 KST
        
        PredictionTimeResult result = PredictionTimeCalculator.calculate(requestedAtUtc, arrivalAtUtc, featureAsOfUtc);
        
        // 07:00 UTC == 16:00 KST
        assertEquals(OffsetDateTime.of(2026, 8, 6, 7, 0, 0, 0, ZoneOffset.UTC), result.predictionTargetAt());
        assertEquals(30, result.targetOffsetMinutes()); // 06:30 -> 07:00 (30분)
        assertEquals(120, result.horizonMinutes()); // 05:00 -> 07:00 (120분)
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }
}
