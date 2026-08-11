package com.ddarungflow.weather;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WeatherForecastSelectorTest {

    private final WeatherForecastSelector selector = new WeatherForecastSelector();

    private final ZoneOffset KST = ZoneOffset.ofHours(9);

    @Test
    @DisplayName("도착 시각 30분 미만/이상 반올림 검증: 16:29 -> 16:00, 16:30 -> 17:00, 23:30 -> 다음날 00:00")
    void testArrivalAtRounding() {
        OffsetDateTime arrival1 = OffsetDateTime.of(2026, 8, 11, 16, 29, 0, 0, KST);
        WeatherForecastResult result1 = selector.select("ST-01", arrival1, 60, 127, OffsetDateTime.now(), List.of(), List.of(), true);
        assertEquals(OffsetDateTime.of(2026, 8, 11, 16, 0, 0, 0, KST), result1.forecastAt());

        OffsetDateTime arrival2 = OffsetDateTime.of(2026, 8, 11, 16, 30, 0, 0, KST);
        WeatherForecastResult result2 = selector.select("ST-01", arrival2, 60, 127, OffsetDateTime.now(), List.of(), List.of(), true);
        assertEquals(OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST), result2.forecastAt());

        OffsetDateTime arrival3 = OffsetDateTime.of(2026, 8, 11, 23, 30, 0, 0, KST);
        WeatherForecastResult result3 = selector.select("ST-01", arrival3, 60, 127, OffsetDateTime.now(), List.of(), List.of(), true);
        assertEquals(OffsetDateTime.of(2026, 8, 12, 0, 0, 0, 0, KST), result3.forecastAt());
    }

    @Test
    @DisplayName("최신 예보가 정상이고 완결된 데이터일 때 NORMAL 반환")
    void testNormalStatus() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 15, 0, 0, KST); // target: 17:00
        OffsetDateTime targetAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);
        OffsetDateTime issuedAt = OffsetDateTime.of(2026, 8, 11, 14, 0, 0, 0, KST);
        OffsetDateTime collectedAt = OffsetDateTime.of(2026, 8, 11, 14, 5, 0, 0, KST);

        WeatherForecastSelector.ForecastPoint point =
            new WeatherForecastSelector.ForecastPoint(issuedAt, targetAt, 26.5, 30, 0, "1");

        WeatherForecastResult result = selector.select("ST-01", arrivalAt, 60, 127, collectedAt, List.of(point), List.of(), false);

        assertEquals(WeatherStatus.NORMAL, result.status());
        assertEquals(26.5, result.temperature());
        assertEquals(30, result.pop());
        assertEquals(0, result.pty());
        assertEquals("1", result.skyStatus());
        assertFalse(result.isRainy());
    }

    @Test
    @DisplayName("POP 49% -> isRainy false, POP 50% -> isRainy true (경계값 검증)")
    void testPopRainyBoundary() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);
        OffsetDateTime targetAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);

        // POP 49%
        WeatherForecastSelector.ForecastPoint point49 =
            new WeatherForecastSelector.ForecastPoint(arrivalAt.minusHours(2), targetAt, 25.0, 49, 0, "3");
        WeatherForecastResult res49 = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusHours(1), List.of(point49), List.of(), false);
        assertFalse(res49.isRainy());

        // POP 50%
        WeatherForecastSelector.ForecastPoint point50 =
            new WeatherForecastSelector.ForecastPoint(arrivalAt.minusHours(2), targetAt, 25.0, 50, 0, "3");
        WeatherForecastResult res50 = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusHours(1), List.of(point50), List.of(), false);
        assertTrue(res50.isRainy());
    }

    @Test
    @DisplayName("PTY 0~4 강수형태에 따른 isRainy 검증 (0: 없음(false), 1: 비(true), 2: 비/눈(true), 3: 눈(true), 4: 소나기(true))")
    void testPtyRainyConditions() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);
        OffsetDateTime targetAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);

        int[] ptyValues = {0, 1, 2, 3, 4};
        boolean[] expectedIsRainy = {false, true, true, true, true};

        for (int i = 0; i < ptyValues.length; i++) {
            WeatherForecastSelector.ForecastPoint point =
                new WeatherForecastSelector.ForecastPoint(arrivalAt.minusHours(2), targetAt, 20.0, 10, ptyValues[i], "1");

            WeatherForecastResult result = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusHours(1), List.of(point), List.of(), false);
            assertEquals(expectedIsRainy[i], result.isRainy(), "PTY " + ptyValues[i] + " 검증 실패");
        }
    }

    @Test
    @DisplayName("최신 예보 수집 실패 시 직전 성공 완전값 사용 -> DELAYED 상태 반환")
    void testDelayedStatusWhenLatestFetchFailed() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);
        OffsetDateTime targetAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);

        // 직전 배치: 성공 및 완전값
        WeatherForecastSelector.ForecastPoint prevPoint =
            new WeatherForecastSelector.ForecastPoint(arrivalAt.minusHours(4), targetAt, 22.0, 20, 0, "1");

        WeatherForecastResult result = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusMinutes(30), List.of(), List.of(prevPoint), true);

        assertEquals(WeatherStatus.DELAYED, result.status());
        assertEquals(22.0, result.temperature());
        assertEquals(prevPoint.issuedAt(), result.announcedAt());
    }

    @Test
    @DisplayName("필수 필드(기온/강수확률/강수형태/하늘상태) 누락 시 MISSING 상태 반환")
    void testMissingStatusWhenFieldIsNull() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);
        OffsetDateTime targetAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);

        // 기온 null
        WeatherForecastSelector.ForecastPoint pointTmpNull =
            new WeatherForecastSelector.ForecastPoint(arrivalAt.minusHours(2), targetAt, null, 20, 0, "1");
        WeatherForecastResult resTmpNull = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusHours(1), List.of(pointTmpNull), List.of(), false);
        assertEquals(WeatherStatus.MISSING, resTmpNull.status());
        assertNull(resTmpNull.temperature());

        // 하늘상태(skyCode) null
        WeatherForecastSelector.ForecastPoint pointSkyNull =
            new WeatherForecastSelector.ForecastPoint(arrivalAt.minusHours(2), targetAt, 25.0, 20, 0, null);
        WeatherForecastResult resSkyNull = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusHours(1), List.of(pointSkyNull), List.of(), false);
        assertEquals(WeatherStatus.MISSING, resSkyNull.status());
        assertNull(resSkyNull.skyStatus());
    }

    @Test
    @DisplayName("모든 배치 실패 또는 대체 데이터가 없는 경우 UNAVAILABLE 상태 반환")
    void testUnavailableStatusWhenNoDataAvailable() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);

        WeatherForecastResult result = selector.select("ST-01", arrivalAt, 60, 127, arrivalAt.minusMinutes(30), List.of(), List.of(), true);

        assertEquals(WeatherStatus.UNAVAILABLE, result.status());
        assertNull(result.temperature());
        assertNull(result.pop());
        assertNull(result.pty());
        assertFalse(result.isRainy());
        assertTrue(result.hourlyForecasts().isEmpty());
    }

    @Test
    @DisplayName("도착일 기준 시간별 예보 필터링 및 오름차순 정렬 검증 (전날/다음날 제외, 도착일만 시간순 포함)")
    void testHourlyForecastsFilteredByArrivalDate() {
        OffsetDateTime arrivalAt = OffsetDateTime.of(2026, 8, 11, 17, 15, 0, 0, KST); // arrival date: 2026-08-11
        OffsetDateTime targetAt = OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST);
        OffsetDateTime issuedAt = OffsetDateTime.of(2026, 8, 11, 14, 0, 0, 0, KST);
        OffsetDateTime collectedAt = OffsetDateTime.of(2026, 8, 11, 14, 5, 0, 0, KST);

        // 전날 예보 (2026-08-10 23:00)
        WeatherForecastSelector.ForecastPoint prevDayPoint =
            new WeatherForecastSelector.ForecastPoint(issuedAt, OffsetDateTime.of(2026, 8, 10, 23, 0, 0, 0, KST), 22.0, 10, 0, "1");

        // 도착일 19:00 예보 (순서 섞어서 추가)
        WeatherForecastSelector.ForecastPoint arrivalDay19 =
            new WeatherForecastSelector.ForecastPoint(issuedAt, OffsetDateTime.of(2026, 8, 11, 19, 0, 0, 0, KST), 24.0, 20, 0, "1");

        // 도착일 17:00 예보 (목표 항목)
        WeatherForecastSelector.ForecastPoint arrivalDay17 =
            new WeatherForecastSelector.ForecastPoint(issuedAt, targetAt, 26.5, 30, 0, "1");

        // 다음날 예보 (2026-08-12 01:00)
        WeatherForecastSelector.ForecastPoint nextDayPoint =
            new WeatherForecastSelector.ForecastPoint(issuedAt, OffsetDateTime.of(2026, 8, 12, 1, 0, 0, 0, KST), 20.0, 10, 0, "1");

        List<WeatherForecastSelector.ForecastPoint> points = List.of(prevDayPoint, arrivalDay19, arrivalDay17, nextDayPoint);

        WeatherForecastResult result = selector.select("ST-01", arrivalAt, 60, 127, collectedAt, points, List.of(), false);

        List<WeatherForecastResult.HourlyForecast> hourlyList = result.hourlyForecasts();

        // 1. 전날/다음날 제외되고 도착일 예보 2건만 포함되는지 확인
        assertEquals(2, hourlyList.size());

        // 2. 도착일 예보만 포함되었는지 확인
        assertTrue(hourlyList.stream().allMatch(h -> h.forecastAt().toLocalDate().equals(arrivalAt.toLocalDate())));

        // 3. 도착일 내에서 시간순 오름차순 정렬되었는지 확인 (17:00 -> 19:00)
        assertEquals(OffsetDateTime.of(2026, 8, 11, 17, 0, 0, 0, KST), hourlyList.get(0).forecastAt());
        assertEquals(OffsetDateTime.of(2026, 8, 11, 19, 0, 0, 0, KST), hourlyList.get(1).forecastAt());
    }

    @Test
    @DisplayName("잘못된 입력 예외 처리 (arrivalAt null 시 IllegalArgumentException 예외 발생)")
    void testInvalidInputs() {
        assertThrows(IllegalArgumentException.class, () -> {
            selector.select("ST-01", null, 60, 127, OffsetDateTime.now(), List.of(), List.of(), false);
        });
    }
}
