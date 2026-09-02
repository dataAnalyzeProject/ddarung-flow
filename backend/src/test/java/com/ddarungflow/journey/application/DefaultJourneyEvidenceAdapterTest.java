package com.ddarungflow.journey.application;

import com.ddarungflow.airquality.AirQualityResponse;
import com.ddarungflow.airquality.AirQualityService;
import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.NearbyPlaceService;
import com.ddarungflow.weather.WeatherArrivalService;
import com.ddarungflow.weather.WeatherForecastResult;
import com.ddarungflow.weather.WeatherStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DefaultJourneyEvidenceAdapterTest {

    @Test
    void mapsActualProviderResultsWithoutChangingFactsOrRouteMode() {
        NearbyPlaceService nearby = mock(NearbyPlaceService.class);
        KakaoMapClient kakao = mock(KakaoMapClient.class);
        WeatherArrivalService weather = mock(WeatherArrivalService.class);
        AirQualityService air = mock(AirQualityService.class);
        OffsetDateTime at = OffsetDateTime.parse("2030-09-02T10:00:00+09:00");
        when(nearby.findNearby("station-1", "CAFE", 1)).thenReturn(List.of(new MapApiDtos.NearbyPlaceResponseDto(
                "poi-1", "카페", "서울 성동구", "카페", new BigDecimal("37.551"),
                new BigDecimal("127.041"), 700)));
        when(kakao.fetchRoute(any(), any(), any(), any(), eq("BICYCLE"), eq("ACCESSIBLE")))
                .thenReturn(Optional.of(new MapApiDtos.RouteResultDto(900, 300, "BICYCLE",
                        List.of(new MapApiDtos.RoutePointDto(new BigDecimal("37.55"), new BigDecimal("127.05"))),
                        null, null, List.of())));
        when(weather.getArrivalWeather(any(), any(), eq(at))).thenReturn(new WeatherForecastResult(
                "station-1", at, at, at.minusHours(1), at.minusMinutes(30), 22.5, 10, 0,
                "CLEAR", false, List.of(), WeatherStatus.NORMAL));
        when(air.getAirQuality("station-1")).thenReturn(Optional.of(new AirQualityResponse(
                "station-1", "NORMAL", null, new AirQualityResponse.MeasurementStationDto("성동구", 800),
                at.minusMinutes(20), at.minusMinutes(10), new AirQualityResponse.KhaiDto(42.0, "GOOD", "1"),
                new AirQualityResponse.PollutantDto(18.0, "µg/m³", "GOOD", "1"),
                new AirQualityResponse.PollutantDto(9.0, "µg/m³", "GOOD", "1"),
                new AirQualityResponse.PollutantDto(0.02, "ppm", "GOOD", "1"))));
        DefaultJourneyEvidenceAdapter adapter = new DefaultJourneyEvidenceAdapter(nearby, kakao, weather, air);

        assertThat(adapter.findNearby("station-1", "CAFE", 1)).singleElement().satisfies(place -> {
            assertThat(place.placeId()).isEqualTo("poi-1");
            assertThat(place.distanceMeters()).isEqualTo(700);
        });
        assertThat(adapter.bicycleRoute(new BigDecimal("37.55"), new BigDecimal("127.05"),
                new BigDecimal("37.551"), new BigDecimal("127.041"), "ACCESSIBLE")).get().satisfies(route -> {
            assertThat(route.distanceMeters()).isEqualTo(900);
            assertThat(route.durationSeconds()).isEqualTo(300);
            assertThat(route.travelMode()).isEqualTo("BICYCLE");
            assertThat(route.routeMode()).isEqualTo("ACCESSIBLE");
        });
        assertThat(adapter.weather(new BigDecimal("37.55"), new BigDecimal("127.05"), at).numericFacts())
                .containsEntry("temperatureCelsius", new BigDecimal("22.5"));
        assertThat(adapter.airQuality("station-1").numericFacts())
                .containsEntry("pm10", new BigDecimal("18.0"));
        verify(kakao).fetchRoute(any(), any(), any(), any(), eq("BICYCLE"), eq("ACCESSIBLE"));
    }
}
