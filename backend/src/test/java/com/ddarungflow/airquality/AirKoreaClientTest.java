package com.ddarungflow.airquality;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class AirKoreaClientTest {

    private static final String CATALOG_FIXTURE = """
        {
          "response": {
            "header": { "resultCode": "00", "resultMsg": "NORMAL_CODE" },
            "body": {
              "items": [
                {
                  "stationName": "석바위",
                  "addr": "인천 미추홀구 주안6동 1587(석바위 삼거리)",
                  "item": "SO2, CO, O3, NO2, PM10, PM2.5",
                  "mangName": "도로변대기",
                  "year": "1996",
                  "dmX": "37.457778",
                  "dmY": "126.690833"
                },
                {
                  "stationName": "무측정항목",
                  "addr": "테스트 주소",
                  "item": "SO2, CO, NO2",
                  "mangName": "도시대기",
                  "year": "2000",
                  "dmX": "37.500000",
                  "dmY": "127.000000"
                }
              ]
            }
          }
        }
        """;

    private static final String CATALOG_FAILURE_FIXTURE = """
        {
          "response": {
            "header": { "resultCode": "30", "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" },
            "body": { "items": [] }
          }
        }
        """;

    private static final String MEASUREMENT_FIXTURE = """
        {
          "response": {
            "header": { "resultCode": "00", "resultMsg": "NORMAL_SERVICE" },
            "body": {
              "items": [
                {
                  "stationName": "석바위",
                  "dataTime": "2026-08-16 10:00",
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

    private AirKoreaProperties properties() {
        return new AirKoreaProperties("https://apis.data.go.kr/B552584", "test-key", 1000);
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<String> mockResponse(int statusCode, String body) {
        HttpResponse<String> response = Mockito.mock(HttpResponse.class);
        Mockito.when(response.statusCode()).thenReturn(statusCode);
        Mockito.when(response.body()).thenReturn(body);
        return response;
    }

    @Test
    @DisplayName("측정소 catalog 파싱: dmX=위도, dmY=경도, item 목록 파싱 및 대기질 항목 보유 필터")
    void parseCatalogResponseParsesFieldsAndFiltersByMeasuredItem() {
        AirKoreaClient client = new AirKoreaClient(properties(), req -> mockResponse(200, CATALOG_FIXTURE));

        List<AirKoreaClient.AirKoreaStation> stations = client.parseCatalogResponse(CATALOG_FIXTURE);

        assertEquals(2, stations.size());
        AirKoreaClient.AirKoreaStation seokbawi = stations.get(0);
        assertEquals("석바위", seokbawi.stationName());
        assertEquals(0, new BigDecimal("37.457778").compareTo(seokbawi.latitude()));
        assertEquals(0, new BigDecimal("126.690833").compareTo(seokbawi.longitude()));
        assertTrue(seokbawi.measuresAirQualityItem());

        AirKoreaClient.AirKoreaStation noAirQualityItem = stations.get(1);
        assertFalse(noAirQualityItem.measuresAirQualityItem());
    }

    @Test
    @DisplayName("resultCode != 00 인 catalog 응답은 빈 목록 반환")
    void parseCatalogResponseReturnsEmptyOnFailureResultCode() {
        AirKoreaClient client = new AirKoreaClient(properties(), req -> mockResponse(200, CATALOG_FAILURE_FIXTURE));
        assertTrue(client.parseCatalogResponse(CATALOG_FAILURE_FIXTURE).isEmpty());
    }

    @Test
    @DisplayName("catalog 24시간 캐시: 두 번째 호출은 실제 HTTP 호출 없이 캐시된 목록 반환")
    void fetchStationCatalogUsesCacheWithinTtl() {
        AtomicInteger callCount = new AtomicInteger(0);
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            callCount.incrementAndGet();
            return mockResponse(200, CATALOG_FIXTURE);
        });

        List<AirKoreaClient.AirKoreaStation> first = client.fetchStationCatalog();
        List<AirKoreaClient.AirKoreaStation> second = client.fetchStationCatalog();

        assertEquals(1, callCount.get());
        assertEquals(2, first.size());
        assertEquals(first, second);
    }

    @Test
    @DisplayName("catalog 실측 실패 시 이전 캐시가 있으면 캐시를 유지해 반환")
    void fetchStationCatalogFallsBackToStaleCacheOnLiveFailure() {
        AtomicInteger callCount = new AtomicInteger(0);
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            int n = callCount.incrementAndGet();
            if (n == 1) {
                return mockResponse(200, CATALOG_FIXTURE);
            }
            return mockResponse(500, "");
        });

        List<AirKoreaClient.AirKoreaStation> first = client.fetchStationCatalog();
        assertEquals(2, first.size());
    }

    @Test
    @DisplayName("측정값 30분 캐시: TTL 이내 두 번째 호출은 실제 HTTP 호출 없이 캐시 반환, latestFetchFailed=false")
    void fetchMeasurementUsesCacheWithinTtl() {
        AtomicInteger callCount = new AtomicInteger(0);
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            callCount.incrementAndGet();
            return mockResponse(200, MEASUREMENT_FIXTURE);
        });

        AirKoreaClient.MeasurementFetchResult first = client.fetchMeasurement("석바위");
        AirKoreaClient.MeasurementFetchResult second = client.fetchMeasurement("석바위");

        assertEquals(1, callCount.get());
        assertFalse(first.latestFetchFailed());
        assertFalse(second.latestFetchFailed());
        assertEquals(MEASUREMENT_FIXTURE, second.latestJson());
    }

    @Test
    @DisplayName("측정값 외부 HTTP 오류(500)는 latestFetchFailed=true, previousJson=null(캐시 없는 첫 호출)")
    void fetchMeasurementMarksTransportFailure() {
        AirKoreaClient client = new AirKoreaClient(properties(), req -> mockResponse(500, ""));

        AirKoreaClient.MeasurementFetchResult result = client.fetchMeasurement("석바위");

        assertTrue(result.latestFetchFailed());
        assertNull(result.latestJson());
        assertNull(result.previousJson());
    }

    @Test
    @DisplayName("측정값 HTTP 200이지만 예외 발생 시(exception 던지는 transport) latestFetchFailed=true")
    void fetchMeasurementMarksExceptionAsFailure() {
        AirKoreaClient client = new AirKoreaClient(properties(), req -> {
            throw new RuntimeException("connection refused");
        });

        AirKoreaClient.MeasurementFetchResult result = client.fetchMeasurement("석바위");

        assertTrue(result.latestFetchFailed());
        assertNull(result.latestJson());
    }

    @Test
    @DisplayName("측정값 resultCode != 00 응답은 latestFetchFailed=false로 그대로 전달(매퍼가 UNAVAILABLE 판정)")
    void fetchMeasurementPassesThroughNonOkResultCodeAsSuccessfulTransport() {
        String failureBody = """
            { "response": { "header": { "resultCode": "99", "resultMsg": "SERVICE_ERROR" }, "body": { "items": [] } } }
            """;
        AirKoreaClient client = new AirKoreaClient(properties(), req -> mockResponse(200, failureBody));

        AirKoreaClient.MeasurementFetchResult result = client.fetchMeasurement("석바위");

        assertFalse(result.latestFetchFailed());
        assertEquals(failureBody, result.latestJson());
    }
}
