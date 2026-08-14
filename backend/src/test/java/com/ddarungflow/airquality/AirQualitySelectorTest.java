package com.ddarungflow.airquality;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class AirQualitySelectorTest {

    private final AirQualitySelector selector = new AirQualitySelector();
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
    @DisplayName("resultCode=00 응답 데이터를 화면 DTO로 올바르게 정규화하고 raw code 및 Grade enum을 보존한다")
    void testNormalizeContractFixtureResultCode00() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = selector.selectFromJson(
                "종로구",
                targetTime,
                null,
                CONTRACT_FIXTURE_RESULT_00,
                null,
                false
        );

        assertEquals(AirQualityStatus.NORMAL, result.status());
        assertEquals("종로구", result.stationName());
        assertEquals(35, result.pm10Value());
        assertEquals(18, result.pm25Value());
        assertEquals(0.042, result.o3Value());
        assertEquals(62, result.khaiValue());

        // Raw code 보존 확인
        assertEquals("1", result.pm10GradeCode());
        assertEquals("2", result.pm25GradeCode());
        assertEquals("3", result.khaiGradeCode());

        // Grade 매핑 (1->GOOD, 2->MODERATE, 3->BAD, 4->VERY_BAD) 확인
        assertEquals(AirQualityGrade.GOOD, result.pm10Grade());
        assertEquals(AirQualityGrade.MODERATE, result.pm25Grade());
        assertEquals(AirQualityGrade.BAD, result.khaiGrade());
    }

    @Test
    @DisplayName("'-' 및 null 문자열을 개별 null로 변환하고 세 오염물질 수치가 모두 없으면 MISSING으로 판정한다")
    void testHyphenAndNullNormalizedAndAllPollutantsMissing() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = selector.selectFromJson(
                "종로구",
                targetTime,
                null,
                FIXTURE_WITH_HYPHEN_AND_NULL,
                null,
                false
        );

        assertEquals(AirQualityStatus.MISSING, result.status());
        assertNull(result.pm10Value());
        assertNull(result.pm25Value());
        assertNull(result.o3Value());
        assertNull(result.khaiValue());
        assertNull(result.khaiGrade());
        assertNull(result.khaiGradeCode());

        // 1->GOOD, 4->VERY_BAD 매핑 검증
        assertEquals(AirQualityGrade.GOOD, result.pm10Grade());
        assertEquals(AirQualityGrade.VERY_BAD, result.pm25Grade());
        assertEquals("4", result.pm25GradeCode());
    }

    @Test
    @DisplayName("2시간 이내는 NORMAL, 2시간 초과~6시간 이내는 DELAYED, 6시간 초과는 UNAVAILABLE로 판정한다")
    void testTimeBoundaries2hAnd6h() {
        // dataTime = 11:00
        OffsetDateTime target2hIn = OffsetDateTime.of(2026, 8, 14, 13, 0, 0, 0, KST);   // 2시간 경계 이내
        OffsetDateTime target4h = OffsetDateTime.of(2026, 8, 14, 15, 0, 0, 0, KST);     // 4시간 (2h~6h)
        OffsetDateTime target6h1m = OffsetDateTime.of(2026, 8, 14, 17, 1, 0, 0, KST);   // 6시간 1분 초과

        AirQualityResult normalResult = selector.selectFromJson("종로구", target2hIn, null, CONTRACT_FIXTURE_RESULT_00, null, false);
        assertEquals(AirQualityStatus.NORMAL, normalResult.status());

        AirQualityResult delayedResult = selector.selectFromJson("종로구", target4h, null, CONTRACT_FIXTURE_RESULT_00, null, false);
        assertEquals(AirQualityStatus.DELAYED, delayedResult.status());

        AirQualityResult unavailableResult = selector.selectFromJson("종로구", target6h1m, null, CONTRACT_FIXTURE_RESULT_00, null, false);
        assertEquals(AirQualityStatus.UNAVAILABLE, unavailableResult.status());
    }

    @Test
    @DisplayName("resultCode != 00 등 source 사용 불가능 시 UNAVAILABLE로 판정한다")
    void testSourceUnavailableWhenResultCodeNot00() {
        OffsetDateTime targetTime = OffsetDateTime.of(2026, 8, 14, 11, 30, 0, 0, KST);

        AirQualityResult result = selector.selectFromJson(
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
