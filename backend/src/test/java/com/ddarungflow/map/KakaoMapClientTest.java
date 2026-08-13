package com.ddarungflow.map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class KakaoMapClientTest {

    @Test
    @DisplayName("HTTP 성공 및 정상 장소가 존재할 때 searchPlaces()가 결과를 DTO 목록으로 올바르게 변환한다")
    void searchPlacesHttpSuccessWithPlaces() {
        String jsonBody = """
            {
              "documents": [
                {
                  "id": "12345",
                  "place_name": "서울역",
                  "address_name": "서울 용산구 한강대로 405",
                  "x": "126.9707",
                  "y": "37.5547"
                }
              ]
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        List<MapApiDtos.PlaceSearchResponseDto> results = client.searchPlaces("서울역");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).placeId()).isEqualTo("12345");
        assertThat(results.get(0).name()).isEqualTo("서울역");
        assertThat(results.get(0).address()).isEqualTo("서울 용산구 한강대로 405");
        assertThat(results.get(0).latitude()).isEqualTo(new BigDecimal("37.5547"));
        assertThat(results.get(0).longitude()).isEqualTo(new BigDecimal("126.9707"));
    }

    @Test
    @DisplayName("정상 응답(HTTP 200)이지만 장소가 0개(empty documents)일 때 searchPlaces()가 빈 목록을 반환한다")
    void searchPlacesHttpSuccessZeroPlaces() {
        String jsonBody = """
            {
              "documents": []
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        List<MapApiDtos.PlaceSearchResponseDto> results = client.searchPlaces("존재하지않는장소");

        assertThat(results).isEmpty();
    }

    @Test
    @DisplayName("HTTP 500 오류 발생 시 searchPlaces()가 예외를 던지지 않고 빈 목록을 반환한다")
    void searchPlacesHttp500ServerError() {
        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(500);
        when(mockResponse.body()).thenReturn("Internal Server Error");

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        List<MapApiDtos.PlaceSearchResponseDto> results = client.searchPlaces("서울역");

        assertThat(results).isEmpty();
    }

    @Test
    @DisplayName("네트워크 예외 발생 시 searchPlaces()가 예외를 포획하여 빈 목록을 반환한다")
    void searchPlacesNetworkException() {
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            throw new RuntimeException("Network Connection Failed");
        });
        List<MapApiDtos.PlaceSearchResponseDto> results = client.searchPlaces("서울역");

        assertThat(results).isEmpty();
    }

    @Test
    @DisplayName("HTTP 200 응답에서 장소의 x 또는 y 좌표가 누락된 항목은 searchPlaces() 흐름에서 최종 목록에서 제외된다")
    void searchPlacesMissingCoordinatesFiltered() {
        String jsonBody = """
            {
              "documents": [
                {
                  "id": "123",
                  "place_name": "좌표누락장소",
                  "address_name": "서울 중구 태평로1가",
                  "x": null,
                  "y": "37.5665"
                },
                {
                  "id": "456",
                  "place_name": "정상장소",
                  "address_name": "서울 중구 세종대로 110",
                  "x": "126.9780",
                  "y": "37.5665"
                }
              ]
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        List<MapApiDtos.PlaceSearchResponseDto> results = client.searchPlaces("서울");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).placeId()).isEqualTo("456");
        assertThat(results.get(0).name()).isEqualTo("정상장소");
    }

    @Test
    @DisplayName("2자 미만 검색어 입력 시 HTTP 요청 없이 빈 목록을 반환한다")
    void searchShortQueryReturnsEmpty() {
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key");
        List<MapApiDtos.PlaceSearchResponseDto> results = client.searchPlaces("서");
        assertThat(results).isEmpty();
    }

    @Test
    @DisplayName("convertsWalkingRouteDistanceAndDuration: WALK fake 응답의 거리 820m, 시간 640초를 올바르게 변환한다")
    void convertsWalkingRouteDistanceAndDuration() {
        String jsonBody = """
            {
              "routes": [
                {
                  "summary": {
                    "distance": 820,
                    "duration": 640
                  }
                }
              ]
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        java.util.Optional<MapApiDtos.RouteResultDto> routeOpt = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"),
            "WALK"
        );

        assertThat(routeOpt).isPresent();
        assertThat(routeOpt.get().distanceMeters()).isEqualTo(820);
        assertThat(routeOpt.get().durationSeconds()).isEqualTo(640);
        assertThat(routeOpt.get().travelMode()).isEqualTo("WALK");
    }

    @Test
    @DisplayName("convertsTransitRouteDistanceAndDuration: TRANSIT fake 응답의 거리 4200m, 시간 1080초를 올바르게 변환한다")
    void convertsTransitRouteDistanceAndDuration() {
        String jsonBody = """
            {
              "routes": [
                {
                  "summary": {
                    "distance": 4200,
                    "duration": 1080
                  }
                }
              ]
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        java.util.Optional<MapApiDtos.RouteResultDto> routeOpt = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"),
            "TRANSIT"
        );

        assertThat(routeOpt).isPresent();
        assertThat(routeOpt.get().distanceMeters()).isEqualTo(4200);
        assertThat(routeOpt.get().durationSeconds()).isEqualTo(1080);
        assertThat(routeOpt.get().travelMode()).isEqualTo("TRANSIT");
    }

    @Test
    @DisplayName("doesNotTreatMissingDistanceOrDurationAsSuccess: HTTP 200이지만 거리 또는 시간이 누락된 경우 빈 결과를 반환한다")
    void doesNotTreatMissingDistanceOrDurationAsSuccess() {
        String jsonBody = """
            {
              "routes": [
                {
                  "summary": {
                    "distance": null,
                    "duration": 640
                  }
                }
              ]
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        java.util.Optional<MapApiDtos.RouteResultDto> routeOpt = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"),
            "WALK"
        );

        assertThat(routeOpt).isEmpty();
    }
}
