package com.ddarungflow.controller;

import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.NearbyPlaceService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlaceControllerTest {

    @Test
    void nearbyReturnsEmptyListAsSuccessAndKeepsProviderFailureDistinct() {
        KakaoMapClient client = mock(KakaoMapClient.class);
        NearbyPlaceService service = mock(NearbyPlaceService.class);
        PlaceController controller = new PlaceController(client, service);
        when(service.findNearby("ST-4", "PARK", 5)).thenReturn(List.of());
        when(service.findNearby("ST-4", "RIVER", 5))
            .thenThrow(new KakaoMapClient.ProviderException("PLACE_PROVIDER_ERROR"));

        ResponseEntity<?> empty = controller.nearbyPlaces("ST-4", "PARK", 5);
        ResponseEntity<?> failed = controller.nearbyPlaces("ST-4", "RIVER", 5);

        assertThat(empty.getStatusCode().value()).isEqualTo(200);
        assertThat(empty.getBody()).isEqualTo(List.of());
        assertThat(failed.getStatusCode().value()).isEqualTo(502);
        assertThat(failed.getBody()).isEqualTo(new MapApiDtos.ProviderErrorResponseDto(
            "PLACE_PROVIDER_ERROR", "장소 검색 제공자를 사용할 수 없습니다."
        ));
    }

    @Test
    void nearbyMapsInvalidInputAndUnknownStationToContractStatuses() {
        NearbyPlaceService service = mock(NearbyPlaceService.class);
        PlaceController controller = new PlaceController(mock(KakaoMapClient.class), service);
        when(service.findNearby("ST-4", "INVALID", 5)).thenThrow(new IllegalArgumentException());
        when(service.findNearby("missing", "PARK", 5))
            .thenThrow(new NearbyPlaceService.StationNotFoundException());

        assertThat(controller.nearbyPlaces("ST-4", "INVALID", 5).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.nearbyPlaces("missing", "PARK", 5).getStatusCode().value()).isEqualTo(404);
    }
}
