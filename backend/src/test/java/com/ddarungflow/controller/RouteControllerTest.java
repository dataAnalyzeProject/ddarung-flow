package com.ddarungflow.controller;

import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.map.MapApiDtos;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RouteControllerTest {

    @Test
    void returnsProviderErrorForPublicTransitWithoutWalkingFallback() {
        KakaoMapClient client = mock(KakaoMapClient.class);
        when(client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5660"), new BigDecimal("126.9770"), "PUBLIC_TRANSIT", null
        )).thenThrow(new KakaoMapClient.ProviderException("ROUTE_PROVIDER_ERROR"));

        ResponseEntity<?> response = new RouteController(null, client).estimateRoute(
            new MapApiDtos.RouteEstimateRequestDto(
                new BigDecimal("37.5500"), new BigDecimal("126.9000"),
                new BigDecimal("37.5660"), new BigDecimal("126.9770"), "PUBLIC_TRANSIT", null
            )
        );

        assertThat(response.getStatusCode().value()).isEqualTo(502);
        assertThat(response.getBody()).isEqualTo(
            new MapApiDtos.ProviderErrorResponseDto("ROUTE_PROVIDER_ERROR", "경로 제공자를 사용할 수 없습니다.")
        );
    }

    @Test
    void sendsBicycleRouteModeToTheProvider() {
        KakaoMapClient client = mock(KakaoMapClient.class);
        MapApiDtos.RouteResultDto route = new MapApiDtos.RouteResultDto(
            1200, 360, "BICYCLE", java.util.List.of(), null, null, java.util.List.of()
        );
        when(client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5660"), new BigDecimal("126.9770"), "BICYCLE", "SHORTEST"
        )).thenReturn(Optional.of(route));

        ResponseEntity<?> response = new RouteController(null, client).estimateRoute(
            request("BICYCLE", "SHORTEST")
        );

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isEqualTo(route);
    }

    @Test
    void returnsProviderErrorForBicycleWithoutWalkingFallback() {
        KakaoMapClient client = mock(KakaoMapClient.class);
        when(client.fetchRoute(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5660"), new BigDecimal("126.9770"), "BICYCLE", "BIKE_ONLY"
        )).thenThrow(new KakaoMapClient.ProviderException("ROUTE_PROVIDER_ERROR"));

        ResponseEntity<?> response = new RouteController(null, client).estimateRoute(
            request("BICYCLE", "BIKE_ONLY")
        );

        assertThat(response.getStatusCode().value()).isEqualTo(502);
        assertThat(response.getBody()).isEqualTo(
            new MapApiDtos.ProviderErrorResponseDto("ROUTE_PROVIDER_ERROR", "경로 제공자를 사용할 수 없습니다.")
        );
    }

    @Test
    void rejectsInvalidTravelModeAndRouteModeCombinations() {
        RouteController controller = new RouteController(null, mock(KakaoMapClient.class));

        assertThat(controller.estimateRoute(request("BICYCLE", null)).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.estimateRoute(request("BICYCLE", "FASTEST")).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.estimateRoute(request("WALK", "BIKE_ONLY")).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.estimateRoute(request("PUBLIC_TRANSIT", "ACCESSIBLE")).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.estimateRoute(request("CAR", null)).getStatusCode().value()).isEqualTo(400);
    }

    private MapApiDtos.RouteEstimateRequestDto request(String travelMode, String routeMode) {
        return new MapApiDtos.RouteEstimateRequestDto(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5660"), new BigDecimal("126.9770"), travelMode, routeMode
        );
    }
}
