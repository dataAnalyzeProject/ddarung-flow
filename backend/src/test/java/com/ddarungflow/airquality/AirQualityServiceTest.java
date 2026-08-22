package com.ddarungflow.airquality;

import com.ddarungflow.entity.Station;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AirQualityServiceTest {

    private static final ZoneOffset KST = ZoneOffset.ofHours(9);
    private static final DateTimeFormatter FIXTURE_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private static String recentDataTime() {
        return OffsetDateTime.now(KST).minusMinutes(5).format(FIXTURE_TIME_FORMAT);
    }

    private static final String CATALOG_FIXTURE = """
        {
          "response": {
            "header": { "resultCode": "00", "resultMsg": "NORMAL_CODE" },
            "body": {
              "items": [
                {
                  "stationName": "가까운측정소",
                  "item": "PM10, PM2.5, O3",
                  "dmX": "37.5556488",
                  "dmY": "126.91062927"
                },
                {
                  "stationName": "먼측정소",
                  "item": "PM10, PM2.5, O3",
                  "dmX": "37.6000000",
                  "dmY": "127.0500000"
                },
                {
                  "stationName": "대기질미측정",
                  "item": "SO2, CO, NO2",
                  "dmX": "37.5556000",
                  "dmY": "126.9106000"
                }
              ]
            }
          }
        }
        """;

    private static final String MEASUREMENT_FIXTURE_TEMPLATE = """
        {
          "response": {
            "header": { "resultCode": "00", "resultMsg": "NORMAL_SERVICE" },
            "body": {
              "items": [
                {
                  "stationName": "가까운측정소",
                  "dataTime": "%s",
                  "pm10Value": "8",
                  "pm25Value": "2",
                  "o3Value": "0.035",
                  "khaiValue": "55",
                  "pm10Grade": "1",
                  "pm25Grade": "1",
                  "o3Grade": "2",
                  "khaiGrade": "2"
                }
              ]
            }
          }
        }
        """;

    private static String measurementFixture() {
        return MEASUREMENT_FIXTURE_TEMPLATE.formatted(recentDataTime());
    }

    private AirKoreaProperties properties() {
        return new AirKoreaProperties("https://apis.data.go.kr/B552584", "test-key", 1000);
    }

    private Station station(String id, String lat, String lng, boolean active) {
        return new Station(id, "00102", "테스트 대여소", new BigDecimal(lat), new BigDecimal(lng), active);
    }

    @Test
    @DisplayName("존재하지 않는 stationId는 Optional.empty (컨트롤러가 404로 변환)")
    void unknownStationReturnsEmpty() {
        StationRepository repository = Mockito.mock(StationRepository.class);
        Mockito.when(repository.findById("ST-UNKNOWN")).thenReturn(Optional.empty());
        AirKoreaClient client = new AirKoreaClient(properties(), req -> null);
        AirQualityService service = new AirQualityService(repository, client);

        assertTrue(service.getAirQuality("ST-UNKNOWN").isEmpty());
    }

    @Test
    @DisplayName("비활성 대여소도 Optional.empty (404 처리)")
    void inactiveStationReturnsEmpty() {
        StationRepository repository = Mockito.mock(StationRepository.class);
        Mockito.when(repository.findById("ST-INACTIVE")).thenReturn(Optional.of(station("ST-INACTIVE", "37.55", "126.91", false)));
        AirKoreaClient client = new AirKoreaClient(properties(), req -> null);
        AirQualityService service = new AirQualityService(repository, client);

        assertTrue(service.getAirQuality("ST-INACTIVE").isEmpty());
    }

    @Test
    @DisplayName("최단거리·대기질 측정 항목 보유 측정소를 선택한다 (측정 불가 항목 제외)")
    void selectsNearestStationMeasuringAirQualityItems() {
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> res = Mockito.mock(java.net.http.HttpResponse.class);
            Mockito.when(res.statusCode()).thenReturn(200);
            Mockito.when(res.body()).thenReturn(CATALOG_FIXTURE);
            return res;
        });
        AirQualityService service = new AirQualityService(Mockito.mock(StationRepository.class), client);

        Optional<AirQualityService.NearestMeasurementStation> nearest =
                service.selectNearestMeasurementStation(new BigDecimal("37.5556488"), new BigDecimal("126.91062927"));

        assertTrue(nearest.isPresent());
        assertEquals("가까운측정소", nearest.get().stationName());
        assertEquals(0, nearest.get().distanceMeters());
    }

    @Test
    @DisplayName("같은 거리 측정소는 이름 오름차순으로 선택한다")
    void selectsNameAscendingStationWhenDistancesAreEqual() {
        String tieCatalog = """
            {
              "response": {
                "header": { "resultCode": "00", "resultMsg": "NORMAL_CODE" },
                "body": {
                  "items": [
                    { "stationName": "나측정소", "item": "PM10, PM2.5, O3", "dmX": "37.5556488", "dmY": "126.91062927" },
                    { "stationName": "가측정소", "item": "PM10, PM2.5, O3", "dmX": "37.5556488", "dmY": "126.91062927" }
                  ]
                }
              }
            }
            """;
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> res = Mockito.mock(java.net.http.HttpResponse.class);
            Mockito.when(res.statusCode()).thenReturn(200);
            Mockito.when(res.body()).thenReturn(tieCatalog);
            return res;
        });
        AirQualityService service = new AirQualityService(Mockito.mock(StationRepository.class), client);

        Optional<AirQualityService.NearestMeasurementStation> nearest =
                service.selectNearestMeasurementStation(new BigDecimal("37.5556488"), new BigDecimal("126.91062927"));

        assertTrue(nearest.isPresent());
        assertEquals("가측정소", nearest.get().stationName());
        assertEquals(0, nearest.get().distanceMeters());
    }

    @Test
    @DisplayName("측정소 catalog가 완전히 비어 있으면 UNAVAILABLE 응답, measurementStation은 null")
    void emptyCatalogReturnsUnavailableWithNullMeasurementStation() {
        StationRepository repository = Mockito.mock(StationRepository.class);
        Mockito.when(repository.findById("ST-1")).thenReturn(Optional.of(station("ST-1", "37.55", "126.91", true)));
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> res = Mockito.mock(java.net.http.HttpResponse.class);
            Mockito.when(res.statusCode()).thenReturn(500);
            return res;
        });
        AirQualityService service = new AirQualityService(repository, client);

        Optional<AirQualityResponse> response = service.getAirQuality("ST-1");

        assertTrue(response.isPresent());
        assertEquals("UNAVAILABLE", response.get().status());
        assertNull(response.get().measurementStation());
    }

    @Test
    @DisplayName("정상 흐름: 대여소 -> 최단거리 측정소 -> 실측값 -> CHG-085 DTO 정규화 응답")
    void fullFlowProducesNormalResponse() {
        StationRepository repository = Mockito.mock(StationRepository.class);
        Mockito.when(repository.findById("ST-1"))
                .thenReturn(Optional.of(station("ST-1", "37.5556488", "126.91062927", true)));

        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            String uri = req.uri().toString();
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> res = Mockito.mock(java.net.http.HttpResponse.class);
            Mockito.when(res.statusCode()).thenReturn(200);
            if (uri.contains("MsrstnInfoInqireSvc")) {
                Mockito.when(res.body()).thenReturn(CATALOG_FIXTURE);
            } else {
                Mockito.when(res.body()).thenReturn(measurementFixture());
            }
            return res;
        });
        AirQualityService service = new AirQualityService(repository, client);

        Optional<AirQualityResponse> responseOpt = service.getAirQuality("ST-1");

        assertTrue(responseOpt.isPresent());
        AirQualityResponse response = responseOpt.get();
        assertEquals("ST-1", response.stationId());
        assertEquals("NORMAL", response.status());
        assertEquals("가까운측정소", response.measurementStation().name());
        assertEquals(0, response.measurementStation().distanceMeters());

        assertEquals(8.0, response.pm10().value());
        assertEquals("µg/m³", response.pm10().unit());
        assertEquals("GOOD", response.pm10().grade());
        assertEquals("1", response.pm10().sourceGradeCode());

        assertEquals(0.035, response.o3().value());
        assertEquals("ppm", response.o3().unit());

        assertEquals(55.0, response.khai().value());
        assertEquals("MODERATE", response.khai().grade());
    }
}
