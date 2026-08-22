package com.ddarungflow.map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

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
    @DisplayName("HTTP 500 오류 발생 시 안정된 장소 provider 오류를 던진다")
    void searchPlacesHttp500ServerError() {
        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(500);
        when(mockResponse.body()).thenReturn("Internal Server Error");

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.searchPlaces("서울역"))
            .isInstanceOf(KakaoMapClient.ProviderException.class)
            .hasMessage("PLACE_PROVIDER_ERROR");
    }

    @Test
    @DisplayName("네트워크 예외 발생 시 안정된 장소 provider 오류를 던진다")
    void searchPlacesNetworkException() {
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            throw new RuntimeException("Network Connection Failed");
        });
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.searchPlaces("서울역"))
            .isInstanceOf(KakaoMapClient.ProviderException.class)
            .hasMessage("PLACE_PROVIDER_ERROR");
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
              "status": "OK",
              "route": {
                "properties": {
                  "totalDistance": 820,
                  "totalTime": 640
                },
                "legs": [{ "steps": [{ "path": { "points": [[126.9000, 37.5500], [126.9106, 37.5556]] } }] }]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        AtomicReference<HttpRequest> requestReference = new AtomicReference<>();
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            requestReference.set(req);
            return mockResponse;
        });
        java.util.Optional<MapApiDtos.RouteResultDto> routeOpt = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"),
            "WALK"
        );

        assertThat(routeOpt).isPresent();
        assertThat(routeOpt.get().distanceMeters()).isEqualTo(820);
        assertThat(routeOpt.get().durationSeconds()).isEqualTo(640);
        assertThat(routeOpt.get().travelMode()).isEqualTo("WALK");
        assertThat(routeOpt.get().pathPoints()).hasSize(2);
        assertThat(routeOpt.get().pathPoints().get(0).latitude()).isEqualByComparingTo("37.5500");
        assertThat(routeOpt.get().pathPoints().get(0).longitude()).isEqualByComparingTo("126.9000");
        assertThat(routeOpt.get().pathPoints().get(1).latitude()).isEqualByComparingTo("37.5556");
        assertThat(routeOpt.get().pathPoints().get(1).longitude()).isEqualByComparingTo("126.9106");
        assertThat(requestReference.get().uri().toString())
            .contains("/v2/routing/walk?start_x=126.9000&start_y=37.5500&end_x=126.9106&end_y=37.5556");
    }

    @Test
    @DisplayName("경로 좌표는 WGS84 위도와 경도 범위 안의 값만 유지한다")
    void filtersRoutePointsOutsideWgs84Range() {
        String jsonBody = """
            {
              "status": "OK",
              "route": {
                "properties": { "totalDistance": 820, "totalTime": 640 },
                "legs": [{ "steps": [{ "path": { "points": [
                  [126.9000, 37.5500], [181.0000, 37.5500], [126.9000, 91.0000],
                  [-180.0000, -90.0000], [180.0000, 90.0000]
                ] } }] }]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(jsonBody);
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", request -> response);

        MapApiDtos.RouteResultDto route = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"), "WALK"
        ).orElseThrow();

        assertThat(route.pathPoints()).hasSize(3);
        assertThat(route.pathPoints()).extracting(MapApiDtos.RoutePointDto::latitude)
            .usingElementComparator(BigDecimal::compareTo)
            .containsExactly(new BigDecimal("37.5500"), new BigDecimal("-90.0000"), new BigDecimal("90.0000"));
    }

    @Test
    @DisplayName("모든 경로 좌표가 WGS84 범위 밖이면 빈 배열을 반환한다")
    void returnsEmptyPathWhenAllRoutePointsAreOutsideWgs84Range() {
        String jsonBody = """
            {
              "status": "OK",
              "route": {
                "properties": { "totalDistance": 820, "totalTime": 640 },
                "legs": [{ "steps": [{ "path": { "points": [
                  [180.0001, 37.5500], [126.9000, -90.0001]
                ] } }] }]
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(jsonBody);
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", request -> response);

        MapApiDtos.RouteResultDto route = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"), "WALK"
        ).orElseThrow();

        assertThat(route.pathPoints()).isEmpty();
    }

    @Test
    @DisplayName("convertsTransitRouteDistanceAndDuration: TRANSIT fake 응답의 거리 4200m, 시간 1080초를 올바르게 변환한다")
    void convertsTransitRouteDistanceAndDuration() {
        String jsonBody = """
            {
              "status": "OK",
              "routes": [
                {
                  "properties": {
                    "totalDistance": 4200,
                    "totalTime": 1080
                  }
                },
                {
                  "properties": {
                    "totalDistance": 5200,
                    "totalTime": 900
                  },
                  "steps": [{ "path": { "points": [[126.9000, 37.5500], [126.9106, 37.5556]] } }]
                }
              ]
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        AtomicReference<HttpRequest> requestReference = new AtomicReference<>();
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            requestReference.set(req);
            return mockResponse;
        });
        java.util.Optional<MapApiDtos.RouteResultDto> routeOpt = client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556"), new BigDecimal("126.9106"),
            "PUBLIC_TRANSIT"
        );

        assertThat(routeOpt).isPresent();
        assertThat(routeOpt.get().distanceMeters()).isEqualTo(5200);
        assertThat(routeOpt.get().durationSeconds()).isEqualTo(900);
        assertThat(routeOpt.get().travelMode()).isEqualTo("PUBLIC_TRANSIT");
        assertThat(routeOpt.get().pathPoints()).hasSize(2);
        assertThat(routeOpt.get().pathPoints().get(0).latitude()).isEqualByComparingTo("37.5500");
        assertThat(routeOpt.get().pathPoints().get(0).longitude()).isEqualByComparingTo("126.9000");
        assertThat(routeOpt.get().pathPoints().get(1).latitude()).isEqualByComparingTo("37.5556");
        assertThat(routeOpt.get().pathPoints().get(1).longitude()).isEqualByComparingTo("126.9106");
        assertThat(requestReference.get().uri().toString())
            .contains("/v2/routing/publictraffic?start_x=126.9000&start_y=37.5500&end_x=126.9106&end_y=37.5556");
    }

    @Test
    @DisplayName("doesNotTreatMissingDistanceOrDurationAsSuccess: HTTP 200이지만 거리 또는 시간이 누락되면 provider 오류를 던진다")
    void doesNotTreatMissingDistanceOrDurationAsSuccess() {
        String jsonBody = """
            {
              "status": "OK",
              "route": {
                "properties": {
                  "totalDistance": null,
                  "totalTime": 640
                }
              }
            }
            """;

        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(jsonBody);

        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> mockResponse);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.fetchRoute(
                new BigDecimal("37.5500"), new BigDecimal("126.9000"),
                new BigDecimal("37.5556"), new BigDecimal("126.9106"), "WALK"))
            .isInstanceOf(KakaoMapClient.ProviderException.class)
            .hasMessage("ROUTE_PROVIDER_ERROR");
    }
    @Test
    void placeProviderFailureUsesStableErrorCode() {
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(500);
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", request -> response);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.searchPlaces("Seoul", 1, 10))
            .isInstanceOf(KakaoMapClient.ProviderException.class)
            .hasMessage("PLACE_PROVIDER_ERROR");
    }

    @Test
    void routeProviderInvalidBodyUsesStableErrorCode() {
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"routes\":[]}");
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", request -> response);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.fetchRoute(
                new BigDecimal("37.5"), new BigDecimal("126.9"),
                new BigDecimal("37.6"), new BigDecimal("127.0"), "WALK"))
            .isInstanceOf(KakaoMapClient.ProviderException.class)
            .hasMessage("ROUTE_PROVIDER_ERROR");
    }

    @Test
    void pagedPlaceResponseMapsMetaIsEnd() {
        String body = "{\"meta\":{\"is_end\":false},\"documents\":[]}";
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "test-key", request -> response);

        MapApiDtos.PlaceSearchPageResponseDto result = client.searchPlaces("Seoul", 2, 10);
        assertThat(result.page()).isEqualTo(2);
        assertThat(result.hasNext()).isTrue();
        assertThat(result.places()).isEmpty();
    }
}
