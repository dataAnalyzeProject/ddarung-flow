package com.ddarungflow.airquality;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;

class AirQualitySelectorTest {

    private final AirQualitySelector selector = new AirQualitySelector();
    private static final ZoneOffset KST = ZoneOffset.ofHours(9);

    private static final String VALID_AIR_KOREA_JSON = """
        {
          "response": {
            "header": {
              "resultCode": "00",
              "resultMsg": "NORMAL_CODE"
            },
            "body": {
              "items": [
                {
                  "stationName": "종로구",
                  "dataTime": "2026-08-14 11:00",
                  "pm10Value": "25",
                  "pm25Value": "14",
                  "o3Value": "0.035",
                  "pm10Grade": "1",
                  "pm25Grade": "1",
                  "khaiValue": "55",
                  "khaiGrade": "2"
                }
              ],
              "totalCount": 1
            }
          }
        }
        """;

    private static final String INCOMPLETE_AIR_KOREA_JSON = """
        {
          "response": {
            "body": {
              "items": [
                {
                  "stationName": "종로구",
                  "dataTime": "2026-08-14 11:00",
                  "pm10Value": "-",
                  "pm25Value": "-",
                  "pm10Grade": null,
                  "pm25Grade": null
                }
              ]
            }
          }
        }
        """;

    @Test
    @DisplayName("최신 수집 성공 및 완전한 Fixture 데이터인 경우 NORMAL 상태를 반환한다")
    void testNormalStatusWithValidFixture() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 0, 0, 0, KST);
        OffsetDateTime collectedAt = OffsetDateTime.of(2026, 8, 14, 11, 5, 0, 0, KST);

        AirQualityResult result = selector.selectFromJson(
                "종로구",
                targetTime,
                collectedAt,
                VALID_AIR_KOREA_JSON,
                null,
                false
        );

        assertEquals(AirQualityStatus.NORMAL, result.status());
        assertEquals("종로구", result.stationName());
        assertEquals(25, result.pm10Value());
        assertEquals(14, result.pm25Value());
        assertEquals(0.035, result.o3Value());
        assertEquals("1", result.pm10Grade());
        assertEquals("1", result.pm25Grade());
        assertEquals("2", result.khaiGrade());
    }

    @Test
    @DisplayName("최신 수집 실패 시 직전 데이터가 유효하면 DELAYED 상태를 반환한다")
    void testDelayedStatusWhenLatestFetchFailed() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 0, 0, 0, KST);

        AirQualityResult result = selector.selectFromJson(
                "종로구",
                targetTime,
                null,
                null,
                VALID_AIR_KOREA_JSON,
                true
        );

        assertEquals(AirQualityStatus.DELAYED, result.status());
        assertEquals("종로구", result.stationName());
        assertEquals(25, result.pm10Value());
    }

    @Test
    @DisplayName("수집 시도는 되었으나 대상 측정소가 없거나 필수값이 누락되면 MISSING 상태를 반환한다")
    void testMissingStatusWhenIncompleteData() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 0, 0, 0, KST);

        AirQualityResult result = selector.selectFromJson(
                "종로구",
                targetTime,
                null,
                INCOMPLETE_AIR_KOREA_JSON,
                null,
                false
        );

        assertEquals(AirQualityStatus.MISSING, result.status());
        assertNull(result.pm10Value());
    }

    @Test
    @DisplayName("데이터가 전혀 없으면 UNAVAILABLE 상태를 반환한다")
    void testUnavailableStatusWhenNoData() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 0, 0, 0, KST);

        AirQualityResult result = selector.select(
                "강남구",
                targetTime,
                null,
                Collections.emptyList(),
                Collections.emptyList(),
                false
        );

        assertEquals(AirQualityStatus.UNAVAILABLE, result.status());
    }

    @Test
    @DisplayName("잘못된 입력값(null, 빈문자열, 타임존 불일치)시 IllegalArgumentException이 발생한다")
    void testInvalidInputs() {
        OffsetDateTime kstTime = OffsetDateTime.of(2026, 8, 14, 11, 0, 0, 0, KST);
        OffsetDateTime utcTime = OffsetDateTime.of(2026, 8, 14, 2, 0, 0, 0, ZoneOffset.UTC);

        assertThrows(IllegalArgumentException.class, () -> selector.select(null, kstTime, null, null, null, false));
        assertThrows(IllegalArgumentException.class, () -> selector.select("  ", kstTime, null, null, null, false));
        assertThrows(IllegalArgumentException.class, () -> selector.select("종로구", null, null, null, null, false));
        assertThrows(IllegalArgumentException.class, () -> selector.select("종로구", utcTime, null, null, null, false));
        assertThrows(IllegalArgumentException.class, () -> selector.select("종로구", kstTime, utcTime, null, null, false));
    }
}
