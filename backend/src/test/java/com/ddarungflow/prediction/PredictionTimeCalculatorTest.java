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
    @DisplayName("고정 작업 예시 5종 검증")
    void testFixedExamples() {
        // 1. 15:01 요청(requestedAt), 15:29 도착, feature 14:00 -> target 15:00, offset -29, horizon 60, TOO_SOON
        // (요청시각 15:01 기준으로 target 15:00은 늦지 않으므로 TOO_SOON)
        OffsetDateTime req1 = OffsetDateTime.of(2026, 8, 5, 15, 1, 0, 0, KST);
        OffsetDateTime arr1 = OffsetDateTime.of(2026, 8, 5, 15, 29, 0, 0, KST);
        OffsetDateTime feat1 = OffsetDateTime.of(2026, 8, 5, 14, 0, 0, 0, KST);
        PredictionTimeResult res1 = calculator.calculate(arr1, feat1, req1);
        assertThat(res1.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 15, 0, 0, 0, KST));
        assertThat(res1.targetOffsetMinutes()).isEqualTo(-29L);
        assertThat(res1.horizonMinutes()).isEqualTo(60L);
        assertThat(res1.status()).isEqualTo(PredictionTimeStatus.TOO_SOON);

        // 2. 15:01 요청, 15:30 도착, feature 15:00 -> target 16:00, offset 30, horizon 60, NORMAL
        OffsetDateTime req2 = OffsetDateTime.of(2026, 8, 5, 15, 1, 0, 0, KST);
        OffsetDateTime arr2 = OffsetDateTime.of(2026, 8, 5, 15, 30, 0, 0, KST);
        OffsetDateTime feat2 = OffsetDateTime.of(2026, 8, 5, 15, 0, 0, 0, KST);
        PredictionTimeResult res2 = calculator.calculate(arr2, feat2, req2);
        assertThat(res2.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 16, 0, 0, 0, KST));
        assertThat(res2.targetOffsetMinutes()).isEqualTo(30L);
        assertThat(res2.horizonMinutes()).isEqualTo(60L);
        assertThat(res2.status()).isEqualTo(PredictionTimeStatus.NORMAL);

        // 3. 15:01 요청, 15:41 도착, feature 15:00 -> target 16:00, offset 19, horizon 60, NORMAL
        OffsetDateTime req3 = OffsetDateTime.of(2026, 8, 5, 15, 1, 0, 0, KST);
        OffsetDateTime arr3 = OffsetDateTime.of(2026, 8, 5, 15, 41, 0, 0, KST);
        OffsetDateTime feat3 = OffsetDateTime.of(2026, 8, 5, 15, 0, 0, 0, KST);
        PredictionTimeResult res3 = calculator.calculate(arr3, feat3, req3);
        assertThat(res3.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 16, 0, 0, 0, KST));
        assertThat(res3.targetOffsetMinutes()).isEqualTo(19L);
        assertThat(res3.horizonMinutes()).isEqualTo(60L);
        assertThat(res3.status()).isEqualTo(PredictionTimeStatus.NORMAL);

        // 4. 15:01 요청, 18:31 도착, feature 15:00 -> target 19:00, offset 29, horizon 240, NORMAL
        OffsetDateTime req4 = OffsetDateTime.of(2026, 8, 5, 15, 1, 0, 0, KST);
        OffsetDateTime arr4 = OffsetDateTime.of(2026, 8, 5, 18, 31, 0, 0, KST);
        OffsetDateTime feat4 = OffsetDateTime.of(2026, 8, 5, 15, 0, 0, 0, KST);
        PredictionTimeResult res4 = calculator.calculate(arr4, feat4, req4);
        assertThat(res4.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 19, 0, 0, 0, KST));
        assertThat(res4.horizonMinutes()).isEqualTo(240L);
        assertThat(res4.status()).isEqualTo(PredictionTimeStatus.NORMAL);

        // 5. 15:01 요청, 19:31 도착, feature 15:00 -> target 20:00, offset 29, horizon 300, UNAVAILABLE
        OffsetDateTime req5 = OffsetDateTime.of(2026, 8, 5, 15, 1, 0, 0, KST);
        OffsetDateTime arr5 = OffsetDateTime.of(2026, 8, 5, 19, 31, 0, 0, KST);
        OffsetDateTime feat5 = OffsetDateTime.of(2026, 8, 5, 15, 0, 0, 0, KST);
        PredictionTimeResult res5 = calculator.calculate(arr5, feat5, req5);
        assertThat(res5.predictionTargetAt()).isEqualTo(OffsetDateTime.of(2026, 8, 5, 20, 0, 0, 0, KST));
        assertThat(res5.horizonMinutes()).isEqualTo(300L);
        assertThat(res5.status()).isEqualTo(PredictionTimeStatus.UNAVAILABLE);
    }
}

