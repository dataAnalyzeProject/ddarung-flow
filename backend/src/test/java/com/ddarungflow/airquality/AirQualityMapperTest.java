package com.ddarungflow.airquality;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class AirQualityMapperTest {

    private static final ZoneOffset KST = ZoneOffset.ofHours(9);

    private static final String NORMAL_RESULT_00_FIXTURE = """
        {
          "response": {
            "header": {
              "resultCode": "00",
              "resultMsg": "NORMAL_SERVICE"
            },
            "body": {
              "items": [
                {
                  "stationName": "종로구",
                  "dataTime": "2026-08-14 11:00",
                  "pm10Value": "35",
                  "pm25Value": "18",
                  "o3Value": "0.042",
                  "khaiValue": "62",
                  "pm10Grade": "1",
                  "pm25Grade": "2",
                  "o3Grade": "2",
                  "khaiGrade": "3"
                }
              ]
            }
          }
        }
        """;

    private static final String ONE_POLLUTANT_NULL_FIXTURE = """
        {
          "response": {
            "header": {
              "resultCode": "00",
              "resultMsg": "NORMAL_SERVICE"
            },
            "body": {
              "items": [
                {
                  "stationName": "종로구",
                  "dataTime": "2026-08-14 11:00",
                  "pm10Value": "35",
                  "pm25Value": null,
                  "o3Value": "0.042",
                  "khaiValue": "62",
                  "pm10Grade": "1",
                  "pm25Grade": null,
                  "o3Grade": "2",
                  "khaiGrade": "3"
                }
              ]
            }
          }
        }
        """;

    private static final String THREE_POLLUTANTS_HYPHEN_AND_NULL_FIXTURE = """
        {
          "response": {
            "header": {
              "resultCode": "00",
              "resultMsg": "NORMAL_SERVICE"
            },
            "body": {
              "items": [
                {
                  "stationName": "종로구",
                  "dataTime": "2026-08-14 11:00",
                  "pm10Value": "-",
                  "pm25Value": "null",
                  "o3Value": null,
                  "khaiValue": "-",
                  "pm10Grade": "-",
                  "pm25Grade": null,
                  "o3Grade": "-",
                  "khaiGrade": null
                }
              ]
            }
          }
        }
        """;

    private static final String INVALID_DATA_TIME_FIXTURE = """
        {
          "response": {
            "header": {
              "resultCode": "00",
              "resultMsg": "NORMAL_SERVICE"
            },
            "body": {
              "items": [
                {
                  "stationName": "종로구",
                  "dataTime": "INVALID_TIME_FORMAT",
                  "pm10Value": "35",
                  "pm25Value": "18",
                  "o3Value": "0.042",
                  "khaiValue": "62",
                  "pm10Grade": "1",
                  "pm25Grade": "2",
                  "o3Grade": "2",
                  "khaiGrade": "3"
                }
              ]
            }
          }
        }
        """;

    @Test
    @DisplayName("정상 resultCode 00: PM10, PM2.5, O3, KHAI, grade, dataTime을 화면 DTO로 정상 정규화한다")
    void testNormalResult00FullNormalization() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = AirQualityMapper.mapFromJson(
                "종로구",
                targetTime,
                null,
                NORMAL_RESULT_00_FIXTURE,
                null,
                false
        );

        assertEquals(AirQualityStatus.NORMAL, result.status());
        assertEquals("종로구", result.stationName());
        assertEquals(OffsetDateTime.of(2026, 8, 14, 11, 0, 0, 0, KST), result.dataTime());

        assertEquals(35.0, result.pm10().value());
        assertEquals(AirQualityGrade.GOOD, result.pm10().grade());
        assertEquals("1", result.pm10().sourceGradeCode());

        assertEquals(18.0, result.pm25().value());
        assertEquals(AirQualityGrade.MODERATE, result.pm25().grade());
        assertEquals("2", result.pm25().sourceGradeCode());

        assertEquals(0.042, result.o3().value());
        assertEquals(AirQualityGrade.MODERATE, result.o3().grade());
        assertEquals("2", result.o3().sourceGradeCode());

        assertEquals(62.0, result.khai().value());
        assertEquals(AirQualityGrade.BAD, result.khai().grade());
        assertEquals("3", result.khai().sourceGradeCode());
    }

    @Test
    @DisplayName("한 항목 null vs 세 항목 null 및 '-' 결측 처리와 MISSING 판정 검증")
    void testOneItemNullVsThreeItemsNullAndHyphenMissing() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        // 1. 한 항목(pm25)만 null인 경우: 오염물질이 완전히 없는 것이 아니므로 NORMAL 유지
        AirQualityResult oneNullResult = AirQualityMapper.mapFromJson("종로구", targetTime, null, ONE_POLLUTANT_NULL_FIXTURE, null, false);
        assertEquals(AirQualityStatus.NORMAL, oneNullResult.status());
        assertEquals(35.0, oneNullResult.pm10().value());
        assertNull(oneNullResult.pm25().value());
        assertNull(oneNullResult.pm25().grade());

        // 2. 세 오염물질(pm10, pm25, o3) 수치가 모두 '-' 또는 null인 경우: MISSING 판정
        AirQualityResult threeNullResult = AirQualityMapper.mapFromJson("종로구", targetTime, null, THREE_POLLUTANTS_HYPHEN_AND_NULL_FIXTURE, null, false);
        assertEquals(AirQualityStatus.MISSING, threeNullResult.status());
        assertNull(threeNullResult.pm10().value());
        assertNull(threeNullResult.pm25().value());
        assertNull(threeNullResult.o3().value());
    }

    @Test
    @DisplayName("잘못된 시간 포맷 입력 시 dataTime null 정규화 및 UNAVAILABLE 판정")
    void testInvalidDataTimeFormat() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = AirQualityMapper.mapFromJson(
                "종로구",
                targetTime,
                null,
                INVALID_DATA_TIME_FIXTURE,
                null,
                false
        );

        assertNull(result.dataTime());
        assertEquals(AirQualityStatus.UNAVAILABLE, result.status());
    }

    @Test
    @DisplayName("시간 경계 검증: 120분(NORMAL), 121분(DELAYED), 360분(DELAYED), 361분(UNAVAILABLE)")
    void testExactMinutesBoundaries() {
        // dataTime = 2026-08-14 11:00
        OffsetDateTime target120m = OffsetDateTime.of(2026, 8, 14, 13, 0, 0, 0, KST);   // 120분 경계
        OffsetDateTime target121m = OffsetDateTime.of(2026, 8, 14, 13, 1, 0, 0, KST);   // 121분
        OffsetDateTime target360m = OffsetDateTime.of(2026, 8, 14, 17, 0, 0, 0, KST);   // 360분
        OffsetDateTime target361m = OffsetDateTime.of(2026, 8, 14, 17, 1, 0, 0, KST);   // 361분

        // 120분: NORMAL
        AirQualityResult r120 = AirQualityMapper.mapFromJson("종로구", target120m, null, NORMAL_RESULT_00_FIXTURE, null, false);
        assertEquals(AirQualityStatus.NORMAL, r120.status());

        // 121분: DELAYED
        AirQualityResult r121 = AirQualityMapper.mapFromJson("종로구", target121m, null, NORMAL_RESULT_00_FIXTURE, null, false);
        assertEquals(AirQualityStatus.DELAYED, r121.status());

        // 360분: DELAYED
        AirQualityResult r360 = AirQualityMapper.mapFromJson("종로구", target360m, null, NORMAL_RESULT_00_FIXTURE, null, false);
        assertEquals(AirQualityStatus.DELAYED, r360.status());

        // 361분: UNAVAILABLE
        AirQualityResult r361 = AirQualityMapper.mapFromJson("종로구", target361m, null, NORMAL_RESULT_00_FIXTURE, null, false);
        assertEquals(AirQualityStatus.UNAVAILABLE, r361.status());
    }

    @Test
    @DisplayName("[담당자 추가 test] 최신 수집 실패(latestFetchFailed=true) 시 직전 360분 이내 수집 데이터 대체(DELAYED) 및 361분 초과 시 UNAVAILABLE 검증")
    void testLatestFetchFailedWithPreviousDataFallbackAndAgeLimit() {
        // previous dataTime = 2026-08-14 11:00
        OffsetDateTime target360m = OffsetDateTime.of(2026, 8, 14, 17, 0, 0, 0, KST);   // 360분
        OffsetDateTime target361m = OffsetDateTime.of(2026, 8, 14, 17, 1, 0, 0, KST);   // 361분

        // 1. latestFetchFailed = true, 직전 데이터가 360분 이내 -> DELAYED 반환
        AirQualityResult delayedResult = AirQualityMapper.mapFromJson(
                "종로구",
                target360m,
                null,
                null,
                NORMAL_RESULT_00_FIXTURE,
                true
        );
        assertEquals(AirQualityStatus.DELAYED, delayedResult.status());
        assertEquals(35.0, delayedResult.pm10().value());

        // 2. latestFetchFailed = true, 직전 데이터가 361분 초과 -> UNAVAILABLE 반환
        AirQualityResult unavailableResult = AirQualityMapper.mapFromJson(
                "종로구",
                target361m,
                null,
                null,
                NORMAL_RESULT_00_FIXTURE,
                true
        );
        assertEquals(AirQualityStatus.UNAVAILABLE, unavailableResult.status());
    }
}
