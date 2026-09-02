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
            new BigDecimal("37.5660"), new BigDecimal("126.9770"), "PUBLIC_TRANSIT"
        )).thenThrow(new KakaoMapClient.ProviderException("ROUTE_PROVIDER_ERROR"));

        ResponseEntity<?> response = new RouteController(null, client).estimateRoute(
            new MapApiDtos.RouteEstimateRequestDto(
                new BigDecimal("37.5500"), new BigDecimal("126.9000"),
                new BigDecimal("37.5660"), new BigDecimal("126.9770"), "PUBLIC_TRANSIT"
            )
        );

        assertThat(response.getStatusCode().value()).isEqualTo(502);
        assertThat(response.getBody()).isEqualTo(
            new MapApiDtos.ProviderErrorResponseDto("ROUTE_PROVIDER_ERROR", "경로 제공자를 사용할 수 없습니다.")
        );
    }
}
