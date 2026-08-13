package com.ddarungflow.map;

import com.ddarungflow.inventory.InventoryMapper;
import com.ddarungflow.inventory.InventoryResult;
import com.ddarungflow.inventory.InventoryStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SeoulBikeClientTest {

    @Test
    @DisplayName("정상 응답: stationId, 자전거 수, 수집 시각을 지닌 InventoryResult(NORMAL)로 정확히 변환한다")
    void fetchInventoryHttpSuccessNormal() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "list_total_count": 1,
                "RESULT": {
                  "CODE": "INFO-000",
                  "MESSAGE": "정상 처리되었습니다"
                },
                "row": [
                  {
                    "rackTotCnt": "15",
                    "stationName": "102. 망원역 1번출구 앞",
                    "parkingBikeTotCnt": "11",
                    "shared": "73",
                    "stationLatitude": "37.5556488",
                    "stationLongitude": "126.91062927",
                    "stationId": "ST-4"
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.stationId()).isEqualTo("ST-4");
        assertThat(res.availableBikeCount()).isEqualTo(11);
        assertThat(res.status()).isEqualTo(InventoryStatus.NORMAL);
        assertThat(res.collectedAt()).isNotNull();
    }

    @Test
    @DisplayName("실제 자전거 0대: parkingBikeTotCnt가 0일 때 availableBikeCount=0, NORMAL 상태로 반환한다")
    void fetchInventoryHttpSuccessZeroBikes() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "row": [
                  {
                    "stationId": "ST-4",
                    "parkingBikeTotCnt": "0"
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.availableBikeCount()).isEqualTo(0);
        assertThat(res.status()).isEqualTo(InventoryStatus.NORMAL);
    }

    @Test
    @DisplayName("대여소 행 없음: row가 빈 배열일 때 availableBikeCount=null, MISSING 상태 결과를 반환한다")
    void fetchInventoryEmptyRowReturnsMissing() {
        String emptyJson = """
            {
              "rentBikeStatus": {
                "list_total_count": 0,
                "row": []
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(emptyJson);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.availableBikeCount()).isNull();
        assertThat(res.status()).isEqualTo(InventoryStatus.MISSING);
    }

    @Test
    @DisplayName("필수 필드 누락: parkingBikeTotCnt가 null/빈값인 경우 정상 데이터로 처리하지 않고 MISSING 상태를 반환한다")
    void fetchInventoryMissingRequiredFieldReturnsMissing() {
        String missingFieldJson = """
            {
              "rentBikeStatus": {
                "row": [
                  {
                    "stationId": "ST-4",
                    "parkingBikeTotCnt": null
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(missingFieldJson);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.availableBikeCount()).isNull();
        assertThat(res.status()).isEqualTo(InventoryStatus.MISSING);
    }

    @Test
    @DisplayName("provider 오류: HTTP 500 등 서버 장애 시 승인된 실패 상태(UNAVAILABLE)로 구분한다")
    void fetchInventoryProviderErrorReturnsUnavailable() {
        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(500);
        when(mockResponse.body()).thenReturn("Server Error");

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        assertThat(resultOpt.get().status()).isEqualTo(InventoryStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("네트워크 예외 발생 시 승인된 실패 상태(UNAVAILABLE)로 구분한다")
    void fetchInventoryNetworkExceptionReturnsUnavailable() {
        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> {
            throw new RuntimeException("Connection Timeout");
        });
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        assertThat(resultOpt.get().status()).isEqualTo(InventoryStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("returnsMissingWhenRequestedStationIsAbsent: 요청한 ST-4가 응답에 없고 ST-OTHER만 존재할 때 count=null, MISSING을 반환한다")
    void returnsMissingWhenRequestedStationIsAbsent() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "RESULT": { "CODE": "INFO-000" },
                "row": [
                  {
                    "stationId": "ST-OTHER",
                    "parkingBikeTotCnt": "17"
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.stationId()).isEqualTo("ST-4");
        assertThat(res.availableBikeCount()).isNull();
        assertThat(res.status()).isEqualTo(InventoryStatus.MISSING);
    }

    @Test
    @DisplayName("doesNotUseFirstRowForDifferentStation: 요청한 stationId와 일치하지 않는 첫 번째 행(ST-OTHER, 17대)의 자전거 수를 ST-4 결과로 사용하지 않는다")
    void doesNotUseFirstRowForDifferentStation() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "RESULT": { "CODE": "INFO-000" },
                "row": [
                  {
                    "stationId": "ST-OTHER",
                    "parkingBikeTotCnt": "17"
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.stationId()).isEqualTo("ST-4");
        assertThat(res.availableBikeCount()).isNull();
        assertThat(res.status()).isEqualTo(InventoryStatus.MISSING);
    }

    @Test
    @DisplayName("returnsUnavailableForProviderFailureCodeWithHttp200: HTTP 200이지만 provider가 실패 코드(ERROR-500)를 알리면 NORMAL이 아닌 UNAVAILABLE 상태를 반환한다")
    void returnsUnavailableForProviderFailureCodeWithHttp200() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "RESULT": {
                  "CODE": "ERROR-500",
                  "MESSAGE": "서버 내부 오류가 발생했습니다."
                }
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.availableBikeCount()).isNull();
        assertThat(res.status()).isEqualTo(InventoryStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("keepsZeroBikeCountAsNormal: parkingBikeTotCnt가 0일 때 누락(MISSING)으로 처리하지 않고 count 0과 NORMAL 상태로 유지한다")
    void keepsZeroBikeCountAsNormal() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "RESULT": { "CODE": "INFO-000" },
                "row": [
                  {
                    "stationId": "ST-4",
                    "parkingBikeTotCnt": "0"
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.availableBikeCount()).isEqualTo(0);
        assertThat(res.status()).isEqualTo(InventoryStatus.NORMAL);
    }

    @Test
    @DisplayName("returnsMissingWhenBikeCountFieldIsAbsent: stationId는 일치하지만 parkingBikeTotCnt 필드가 누락된 경우 count=null, MISSING을 반환한다")
    void returnsMissingWhenBikeCountFieldIsAbsent() {
        String jsonBody = """
            {
              "rentBikeStatus": {
                "RESULT": { "CODE": "INFO-000" },
                "row": [
                  {
                    "stationId": "ST-4",
                    "parkingBikeTotCnt": null
                  }
                ]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr:8088", "test-key", new InventoryMapper(), req -> mockResponse);
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4");

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.availableBikeCount()).isNull();
        assertThat(res.status()).isEqualTo(InventoryStatus.MISSING);
    }

    @Test
    @DisplayName("직접 매핑 오버로드 호출 시에도 InventoryResult로 적절히 변환된다")
    void fetchInventoryDirectMappingNormal() {
        SeoulBikeClient client = new SeoulBikeClient("http://openapi.seoul.go.kr", "dummy-key", new InventoryMapper());
        OffsetDateTime now = OffsetDateTime.now();
        Optional<InventoryResult> resultOpt = client.fetchInventory("ST-4", 5, now, true, false);

        assertThat(resultOpt).isPresent();
        InventoryResult res = resultOpt.get();
        assertThat(res.stationId()).isEqualTo("ST-4");
        assertThat(res.availableBikeCount()).isEqualTo(5);
        assertThat(res.status()).isEqualTo(InventoryStatus.NORMAL);
    }
}
