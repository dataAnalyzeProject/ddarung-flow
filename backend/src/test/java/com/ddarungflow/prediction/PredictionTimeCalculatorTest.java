package com.ddarungflow.prediction;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PredictionTimeCalculatorTest {

    private final PredictionTimeCalculator calculator = new PredictionTimeCalculator();
    private static final ZoneOffset KST = ZoneOffset.ofHours(9);

    @Test
    @DisplayName("필수 테스트 1: floorToHour(arrivalAt + 30분) 정시 계산 및 정확히 30분이면 다음 정시 선택")
    void testFloorToHourPlus30Minutes() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST);

        // 10:29 + 30m = 10:59 -> floor = 10:00
        OffsetDateTime arrival1 = OffsetDateTime.of(2026, 8, 5, 10, 29, 0, 0, KST);
        PredictionTimeResult result1 = calculator.calculate(arrival1, featureAsOf);
        assertThat(result1.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST));

        // 10:30 + 30m = 11:00 -> floor = 11:00 (정확히 30분이면 다음 정시 선택)
        OffsetDateTime arrival2 = OffsetDateTime.of(2026, 8, 5, 10, 30, 0, 0, KST);
        PredictionTimeResult result2 = calculator.calculate(arrival2, featureAsOf);
        assertThat(result2.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 11, 0, 0, 0, KST));
    }

    @Test
    @DisplayName("필수 테스트 2: arrivalAt부터 target까지 targetOffsetMinutes 계산 검증")
    void testTargetOffsetMinutesCalculation() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST);
        // arrivalAt = 10:45 -> plus 30m = 11:15 -> target = 11:00. Difference between 10:45 and 11:00 is 15 minutes.
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 5, 10, 45, 0, 0, KST);

        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 11, 0, 0, 0, KST));
        assertThat(result.targetOffsetMinutes()).isEqualTo(15L);
    }

    @Test
    @DisplayName("필수 테스트 3: 목표 정시가 요청시각보다 과거이거나 같으면 TOO_SOON")
    void testTooSoonStatus() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST);

        // Target: 10:00 (equal to featureAsOf)
        OffsetDateTime arrivalSame = OffsetDateTime.of(2026, 8, 5, 9, 30, 0, 0, KST); // 9:30 + 30m = 10:00
        PredictionTimeResult resultSame = calculator.calculate(arrivalSame, featureAsOf);
        assertThat(resultSame.status()).isEqualTo(PredictionTimeStatus.TOO_SOON);

        // Target: 09:00 (past relative to featureAsOf)
        OffsetDateTime arrivalPast = OffsetDateTime.of(2026, 8, 5, 8, 45, 0, 0, KST); // 8:45 + 30m = 9:15 -> 9:00
        PredictionTimeResult resultPast = calculator.calculate(arrivalPast, featureAsOf);
        assertThat(resultPast.status()).isEqualTo(PredictionTimeStatus.TOO_SOON);
    }

    @Test
    @DisplayName("필수 테스트 4: featureAsOf부터 target까지 horizonMinutes 계산 검증")
    void testHorizonMinutesCalculation() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST);
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 5, 12, 40, 0, 0, KST); // 12:40 + 30m = 13:10 -> 13:00

        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.horizonMinutes()).isEqualTo(180L);
    }

    @Test
    @DisplayName("필수 테스트 5: 60, 120, 180, 240 horizon은 NORMAL 반환")
    void testNormalStatusForValidHorizons() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST);

        long[] expectedHorizons = {60L, 120L, 180L, 240L};
        int[] arrivalHours = {10, 11, 12, 13};

        for (int i = 0; i < expectedHorizons.length; i++) {
            OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 5, arrivalHours[i], 30, 0, 0, KST);
            PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

            assertThat(result.horizonMinutes()).isEqualTo(expectedHorizons[i]);
            assertThat(result.status()).isEqualTo(PredictionTimeStatus.NORMAL);
        }
    }

    @Test
    @DisplayName("필수 테스트 6: 60·120·180·240 이외의 미래 horizon은 UNAVAILABLE 반환 및 반올림 안 함")
    void testUnavailableStatusForOtherHorizons() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 10, 0, 0, 0, KST);

        // 300 minutes (5 hours): 14:30 + 30m -> 15:00 (15:00 - 10:00 = 300 minutes)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 5, 14, 30, 0, 0, KST);
        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.horizonMinutes()).isEqualTo(300L);
        assertThat(result.status()).isEqualTo(PredictionTimeStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("담당자 추가 테스트 1: Null 인자 및 UTC offset 불일치 검사 예외 검증")
    void testNullAndOffsetMismatchHandling() {
        OffsetDateTime kstTime = OffsetDateTime.now(KST);
        OffsetDateTime utcTime = OffsetDateTime.now(ZoneOffset.UTC);

        // Null 검사
        assertThatThrownBy(() -> calculator.calculate(null, kstTime))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be null");

        // UTC Offset 불일치 검사
        assertThatThrownBy(() -> calculator.calculate(kstTime, utcTime))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("matching UTC offsets");
    }

    @Test
    @DisplayName("담당자 추가 테스트 2: 자정이 넘어가는 경계시각(23:45) 계산 검증")
    void testMidnightBoundaryCalculation() {
        OffsetDateTime featureAsOf = OffsetDateTime.of(2026, 8, 5, 22, 0, 0, 0, KST);
        // 23:45 + 30m = 00:15 next day -> 00:00 next day (2 hours / 120 mins diff)
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 5, 23, 45, 0, 0, KST);

        PredictionTimeResult result = calculator.calculate(arrivalAt, featureAsOf);

        assertThat(result.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 6, 0, 0, 0, 0, KST));
        assertThat(result.targetOffsetMinutes()).isEqualTo(15L);
        assertThat(result.horizonMinutes()).isEqualTo(120L);
        assertThat(result.status()).isEqualTo(PredictionTimeStatus.NORMAL);
    }
}
