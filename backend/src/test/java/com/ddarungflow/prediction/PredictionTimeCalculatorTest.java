package com.ddarungflow.prediction;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PredictionTimeCalculatorTest {

    private final PredictionTimeCalculator calculator = new PredictionTimeCalculator();

    @Test
    @DisplayName("필수 테스트 1: floorToHour(arrivalAt + 30분) 정시 계산 및 정확히 30분이면 다음 정시 선택")
    void testFloorToHourPlus30Minutes() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 10, 0);

        // 10:29 + 30m = 10:59 -> floor = 10:00
        LocalDateTime arrival1 = LocalDateTime.of(2026, 8, 5, 10, 29);
        PredictionTimeResult result1 = calculator.calculate(arrival1, featureAsOf);
        assertThat(result1.predictionTargetAt()).isEqualTo(LocalDateTime.of(2026, 8, 5, 10, 0));

        // 10:30 + 30m = 11:00 -> floor = 11:00 (정확히 30분이면 다음 정시 선택)
        LocalDateTime arrival2 = LocalDateTime.of(2026, 8, 5, 10, 30);
        PredictionTimeResult result2 = calculator.calculate(arrival2, featureAsOf);
        assertThat(result2.predictionTargetAt()).isEqualTo(LocalDateTime.of(2026, 8, 5, 11, 0));
    }

    @Test
    @DisplayName("필수 테스트 2: targetOffsetMinutes 계산 검증")
    void testTargetOffsetMinutesCalculation() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 10, 0);
        LocalDateTime arrivalAt = LocalDateTime.of(2026, 8, 5, 11, 30); // -> target 12:00

        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.predictionTargetAt()).isEqualTo(LocalDateTime.of(2026, 8, 5, 12, 0));
        assertThat(result.targetOffsetMinutes()).isEqualTo(120L);
    }

    @Test
    @DisplayName("필수 테스트 3: 목표 정시가 요청시각보다 과거이거나 같으면 TOO_SOON")
    void testTooSoonStatus() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 10, 0);

        // Target: 10:00 (equal to featureAsOf)
        LocalDateTime arrivalSame = LocalDateTime.of(2026, 8, 5, 9, 30); // 9:30 + 30m = 10:00
        PredictionTimeResult resultSame = calculator.calculate(arrivalSame, featureAsOf);
        assertThat(resultSame.status()).isEqualTo(PredictionTimeStatus.TOO_SOON);

        // Target: 09:00 (past relative to featureAsOf)
        LocalDateTime arrivalPast = LocalDateTime.of(2026, 8, 5, 8, 45); // 8:45 + 30m = 9:15 -> 9:00
        PredictionTimeResult resultPast = calculator.calculate(arrivalPast, featureAsOf);
        assertThat(resultPast.status()).isEqualTo(PredictionTimeStatus.TOO_SOON);
    }

    @Test
    @DisplayName("필수 테스트 4: horizonMinutes = predictionTargetAt - featureAsOf 계산 검증")
    void testHorizonMinutesCalculation() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 10, 0);
        LocalDateTime arrivalAt = LocalDateTime.of(2026, 8, 5, 12, 40); // 12:40 + 30m = 13:10 -> 13:00

        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.horizonMinutes()).isEqualTo(180L);
    }

    @Test
    @DisplayName("필수 테스트 5: 60, 120, 180, 240 horizon은 NORMAL 반환")
    void testNormalStatusForValidHorizons() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 10, 0);

        long[] expectedHorizons = {60L, 120L, 180L, 240L};
        int[] arrivalHours = {10, 11, 12, 13};

        for (int i = 0; i < expectedHorizons.length; i++) {
            LocalDateTime arrivalAt = LocalDateTime.of(2026, 8, 5, arrivalHours[i], 30);
            PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

            assertThat(result.horizonMinutes()).isEqualTo(expectedHorizons[i]);
            assertThat(result.status()).isEqualTo(PredictionTimeStatus.NORMAL);
        }
    }

    @Test
    @DisplayName("필수 테스트 6: 60·120·180·240 이외의 미래 horizon은 UNAVAILABLE 반환")
    void testUnavailableStatusForOtherHorizons() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 10, 0);

        // 300 minutes (5 hours): 14:30 + 30m -> 15:00 (15:00 - 10:00 = 300 minutes)
        LocalDateTime arrivalAt = LocalDateTime.of(2026, 8, 5, 14, 30);
        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.horizonMinutes()).isEqualTo(300L);
        assertThat(result.status()).isEqualTo(PredictionTimeStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("담당자 추가 테스트 1: Null 인자 전달 시 IllegalArgumentException 발생 검증")
    void testNullArgumentsHandling() {
        LocalDateTime now = LocalDateTime.now();

        assertThatThrownBy(() -> calculator.calculate(null, now))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be null");

        assertThatThrownBy(() -> calculator.calculate(now, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be null");
    }

    @Test
    @DisplayName("담당자 추가 테스트 2: 자정이 넘어가는 경계시각(23:45) 계산 검증")
    void testMidnightBoundaryCalculation() {
        LocalDateTime featureAsOf = LocalDateTime.of(2026, 8, 5, 22, 0);
        // 23:45 + 30m = 00:15 next day -> 00:00 next day (2 hours / 120 mins diff)
        LocalDateTime arrivalAt = LocalDateTime.of(2026, 8, 5, 23, 45);

        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.predictionTargetAt()).isEqualTo(LocalDateTime.of(2026, 8, 6, 0, 0));
        assertThat(result.horizonMinutes()).isEqualTo(120L);
        assertThat(result.status()).isEqualTo(PredictionTimeStatus.NORMAL);
    }
}
