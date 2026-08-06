package com.ddarungflow.prediction;

import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

public class PredictionTimeCalculatorTest {

    private final LocalDateTime baseTime = LocalDateTime.of(2026, 8, 6, 11, 0, 0);

    @Test
    public void testNullInputsThrowException() {
        assertThrows(IllegalArgumentException.class, () -> {
            PredictionTimeCalculator.calculate(null, baseTime);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            PredictionTimeCalculator.calculate(baseTime, null);
        });
    }

    @Test
    public void testRoundingDown() {
        LocalDateTime input = LocalDateTime.of(2026, 8, 6, 11, 23, 45);
        LocalDateTime expected = LocalDateTime.of(2026, 8, 6, 11, 20, 0);
        assertEquals(expected, PredictionTimeCalculator.roundToNearest10Minutes(input));
    }

    @Test
    public void testRoundingUp() {
        LocalDateTime input = LocalDateTime.of(2026, 8, 6, 11, 27, 12);
        LocalDateTime expected = LocalDateTime.of(2026, 8, 6, 11, 30, 0);
        assertEquals(expected, PredictionTimeCalculator.roundToNearest10Minutes(input));
    }

    @Test
    public void testRoundingUpToNextHour() {
        LocalDateTime input = LocalDateTime.of(2026, 8, 6, 11, 58, 0);
        LocalDateTime expected = LocalDateTime.of(2026, 8, 6, 12, 0, 0);
        assertEquals(expected, PredictionTimeCalculator.roundToNearest10Minutes(input));
    }

    @Test
    public void testRoundingDownToHourStart() {
        LocalDateTime input = LocalDateTime.of(2026, 8, 6, 11, 2, 10);
        LocalDateTime expected = LocalDateTime.of(2026, 8, 6, 11, 0, 0);
        assertEquals(expected, PredictionTimeCalculator.roundToNearest10Minutes(input));
    }

    @Test
    public void testStatusTooSoonForPastTime() {
        // 10:50은 기준 시각인 11:00보다 과거 시간임
        LocalDateTime requested = LocalDateTime.of(2026, 8, 6, 10, 50, 0);
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseTime, requested);
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
        assertTrue(result.message().contains("past"));
    }

    @Test
    public void testStatusTooSoonForCloseFuture() {
        // 11:04는 11:00으로 반올림되므로, 준비 시간이 0분이 됨
        LocalDateTime requested = LocalDateTime.of(2026, 8, 6, 11, 4, 0);
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseTime, requested);
        assertEquals(PredictionTimeStatus.TOO_SOON, result.status());
        assertTrue(result.message().contains("lead time"));
    }

    @Test
    public void testStatusNormalOnExactMinLeadTimeBoundary() {
        // 11:08은 11:10으로 반올림되어 기준 시각 11:00에서 정확히 10분 후가 됨
        LocalDateTime requested = LocalDateTime.of(2026, 8, 6, 11, 8, 0);
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseTime, requested);
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
        assertEquals(LocalDateTime.of(2026, 8, 6, 11, 10, 0), result.calculatedTime());
    }

    @Test
    public void testStatusNormalWithinValidWindow() {
        // 15:30은 11:00에서 4.5시간 후로 유효 범위 내의 시간임
        LocalDateTime requested = LocalDateTime.of(2026, 8, 6, 15, 30, 0);
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseTime, requested);
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }

    @Test
    public void testStatusNormalOnExactMaxLimitBoundary() {
        // 다음 날 11:00은 11:00에서 정확히 24시간 후임
        LocalDateTime requested = baseTime.plusHours(24);
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseTime, requested);
        assertEquals(PredictionTimeStatus.NORMAL, result.status());
    }

    @Test
    public void testStatusUnavailableExceedingMaxLimit() {
        // 다음 날 11:06은 11:10(24시간 10분)으로 반올림되므로 24시간 제한을 초과함
        LocalDateTime requested = baseTime.plusHours(24).plusMinutes(6);
        PredictionTimeResult result = PredictionTimeCalculator.calculate(baseTime, requested);
        assertEquals(PredictionTimeStatus.UNAVAILABLE, result.status());
        assertTrue(result.message().contains("24 hours"));
    }
}
