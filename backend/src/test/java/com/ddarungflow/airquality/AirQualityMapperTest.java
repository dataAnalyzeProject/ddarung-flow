package com.ddarungflow.airquality;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class AirQualityMapperTest {

    private static final ZoneOffset KST = ZoneOffset.ofHours(9);

    private static final String CONTRACT_FIXTURE_RESULT_00 = """
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
                  "khaiGrade": "3"
                }
              ]
            }
          }
        }
        """;

    private static final String FIXTURE_WITH_HYPHEN_AND_NULL = """
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
                  "pm10Grade": "1",
                  "pm25Grade": "4",
                  "khaiGrade": "-"
                }
              ]
            }
          }
        }
        """;

    private static final String FIXTURE_ERROR_RESULT_CODE = """
        {
          "response": {
            "header": {
              "resultCode": "30",
              "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"
            },
            "body": {
              "items": []
            }
          }
        }
        """;

    @Test
    @DisplayName("계약 테스트: resultCode=00 응답 데이터를 CHG-085 AirQualityResult 및 AirQualityPollutant 객체로 정규화한다")
    void testContractFixtureNormalization() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = AirQualityMapper.mapFromJson(
                "종로구",
                targetTime,
                null,
                CONTRACT_FIXTURE_RESULT_00,
                null,
                false
        );

        assertEquals(AirQualityStatus.NORMAL, result.status());
        assertEquals("종로구", result.stationName());
        assertNotNull(result.dataTime());

        // PM10
        assertEquals(35.0, result.pm10().value());
        assertEquals(AirQualityMapper.UNIT_PM10, result.pm10().unit());
        assertEquals(AirQualityGrade.GOOD, result.pm10().grade());
        assertEquals("1", result.pm10().sourceGradeCode());

        // PM25
        assertEquals(18.0, result.pm25().value());
        assertEquals(AirQualityMapper.UNIT_PM25, result.pm25().unit());
        assertEquals(AirQualityGrade.MODERATE, result.pm25().grade());
        assertEquals("2", result.pm25().sourceGradeCode());

        // O3
        assertEquals(0.042, result.o3().value());
        assertEquals(AirQualityMapper.UNIT_O3, result.o3().unit());

        // KHAI
        assertEquals(62.0, result.khai().value());
        assertEquals(AirQualityMapper.UNIT_KHAI, result.khai().unit());
        assertEquals(AirQualityGrade.BAD, result.khai().grade());
        assertEquals("3", result.khai().sourceGradeCode());
    }

    @Test
    @DisplayName("결측 테스트: '-' 및 null을 개별 null로 변환하고 세 오염물질(pm10, pm25, o3) 수치가 모두 없으면 MISSING으로 판정한다")
    void testMissingAndNullNormalization() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = AirQualityMapper.mapFromJson(
                "종로구",
                targetTime,
                null,
                FIXTURE_WITH_HYPHEN_AND_NULL,
                null,
                false
        );

        assertEquals(AirQualityStatus.MISSING, result.status());
        assertNull(result.pm10().value());
        assertNull(result.pm25().value());
        assertNull(result.o3().value());
        assertNull(result.khai().value());

        // Grade 및 sourceGradeCode 매핑 확인
        assertEquals(AirQualityGrade.GOOD, result.pm10().grade());
        assertEquals("1", result.pm10().sourceGradeCode());

        assertEquals(AirQualityGrade.VERY_BAD, result.pm25().grade());
        assertEquals("4", result.pm25().sourceGradeCode());
    }

    @Test
    @DisplayName("시간 경계 테스트: 2시간 이내는 NORMAL, 2시간 초과~6시간 이내는 DELAYED, 6시간 초과는 UNAVAILABLE로 판정한다")
    void test2hAnd6hTimeBoundaries() {
        OffsetDateTime target2hIn = OffsetDateTime.of(2026, 8, 14, 13, 0, 0, 0, KST);
        OffsetDateTime target4h = OffsetDateTime.of(2026, 8, 14, 15, 0, 0, 0, KST);
        OffsetDateTime target6h1m = OffsetDateTime.of(2026, 8, 14, 17, 1, 0, 0, KST);

        AirQualityResult normalResult = AirQualityMapper.mapFromJson("종로구", target2hIn, null, CONTRACT_FIXTURE_RESULT_00, null, false);
        assertEquals(AirQualityStatus.NORMAL, normalResult.status());

        AirQualityResult delayedResult = AirQualityMapper.mapFromJson("종로구", target4h, null, CONTRACT_FIXTURE_RESULT_00, null, false);
        assertEquals(AirQualityStatus.DELAYED, delayedResult.status());

        AirQualityResult unavailableResult = AirQualityMapper.mapFromJson("종로구", target6h1m, null, CONTRACT_FIXTURE_RESULT_00, null, false);
        assertEquals(AirQualityStatus.UNAVAILABLE, unavailableResult.status());
    }

    @Test
    @DisplayName("source 사용 불가 테스트: resultCode != 00 등 소스 이용 불가능 시 UNAVAILABLE로 판정한다")
    void testUnavailableWhenResultCodeNot00OrNoData() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = AirQualityMapper.mapFromJson(
                "종로구",
                targetTime,
                null,
                FIXTURE_ERROR_RESULT_CODE,
                null,
                false
        );

        assertEquals(AirQualityStatus.UNAVAILABLE, result.status());
    }
}
