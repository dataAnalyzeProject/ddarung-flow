package com.ddarungflow.map;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NearbyPlaceServiceTest {

    private static final BigDecimal LATITUDE = new BigDecimal("37.5556488");
    private static final BigDecimal LONGITUDE = new BigDecimal("126.91062927");

    @ParameterizedTest
    @MethodSource("themes")
    void mapsEveryFrozenThemeToItsProviderQuery(String theme, String queryType, String queryValue) {
        StationQueryService stationQueryService = stationServiceWithActiveStation();
        KakaoMapClient kakaoMapClient = mock(KakaoMapClient.class);
        if ("category".equals(queryType)) {
            when(kakaoMapClient.searchNearbyByCategory(queryValue, LATITUDE, LONGITUDE, 5))
                .thenReturn(List.of());
        } else {
            when(kakaoMapClient.searchNearbyByKeyword(queryValue, LATITUDE, LONGITUDE, 5))
                .thenReturn(List.of());
        }

        new NearbyPlaceService(stationQueryService, kakaoMapClient).findNearby("ST-4", theme, null);

        if ("category".equals(queryType)) {
            verify(kakaoMapClient).searchNearbyByCategory(queryValue, LATITUDE, LONGITUDE, 5);
        } else {
            verify(kakaoMapClient).searchNearbyByKeyword(queryValue, LATITUDE, LONGITUDE, 5);
        }
    }

    @Test
    void rejectsUnknownStationInvalidThemeAndLimitsOutsideServerCap() {
        StationQueryService missingStationService = mock(StationQueryService.class);
        when(missingStationService.findActiveLocation("missing")).thenReturn(Optional.empty());
        KakaoMapClient kakaoMapClient = mock(KakaoMapClient.class);
        NearbyPlaceService service = new NearbyPlaceService(missingStationService, kakaoMapClient);

        assertThatThrownBy(() -> service.findNearby("missing", "PARK", 5))
            .isInstanceOf(NearbyPlaceService.StationNotFoundException.class);
        assertThatThrownBy(() -> service.findNearby("ST-4", "MUSEUM", 5))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findNearby("ST-4", "PARK", 0))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findNearby("ST-4", "PARK", 6))
            .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(kakaoMapClient);
    }

    private StationQueryService stationServiceWithActiveStation() {
        StationQueryService service = mock(StationQueryService.class);
        when(service.findActiveLocation("ST-4")).thenReturn(Optional.of(
            new MapApiDtos.StationLocationResponseDto(
                "ST-4", "00102", "망원역", LATITUDE, LONGITUDE
            )
        ));
        return service;
    }

    private static Stream<Arguments> themes() {
        return Stream.of(
            Arguments.of("PARK", "keyword", "공원"),
            Arguments.of("RIVER", "keyword", "한강공원"),
            Arguments.of("CAFE", "category", "CE7"),
            Arguments.of("ATTRACTION", "category", "AT4"),
            Arguments.of("CULTURE", "category", "CT1"),
            Arguments.of("FOOD", "category", "FD6")
        );
    }
}
