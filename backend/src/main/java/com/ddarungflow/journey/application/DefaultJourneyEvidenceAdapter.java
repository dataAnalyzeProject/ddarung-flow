package com.ddarungflow.journey.application;

import com.ddarungflow.airquality.AirQualityResponse;
import com.ddarungflow.airquality.AirQualityService;
import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.map.NearbyPlaceService;
import com.ddarungflow.weather.WeatherArrivalService;
import com.ddarungflow.weather.WeatherForecastResult;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class DefaultJourneyEvidenceAdapter implements JourneyEvidencePort {
    private final NearbyPlaceService nearbyPlaceService;
    private final KakaoMapClient kakaoMapClient;
    private final WeatherArrivalService weatherService;
    private final AirQualityService airQualityService;

    public DefaultJourneyEvidenceAdapter(
            NearbyPlaceService nearbyPlaceService,
            KakaoMapClient kakaoMapClient,
            WeatherArrivalService weatherService,
            AirQualityService airQualityService
    ) {
        this.nearbyPlaceService = nearbyPlaceService;
        this.kakaoMapClient = kakaoMapClient;
        this.weatherService = weatherService;
        this.airQualityService = airQualityService;
    }

    @Override
    public List<PoiEvidence> findNearby(String stationId, String theme, int limit) {
        return toPoiEvidence(nearbyPlaceService.findNearby(stationId, theme, limit));
    }

    @Override
    public List<PoiEvidence> findNearbyAt(BigDecimal latitude, BigDecimal longitude, String theme, int limit) {
        return toPoiEvidence(nearbyPlaceService.findNearbyAt(latitude, longitude, theme, limit));
    }

    private List<PoiEvidence> toPoiEvidence(List<com.ddarungflow.map.MapApiDtos.NearbyPlaceResponseDto> places) {
        return places.stream()
                .map(place -> new PoiEvidence(place.placeId(), place.name(), place.address(), place.category(),
                        place.latitude(), place.longitude(), place.distanceMeters()))
                .toList();
    }

    @Override
    public Optional<RouteEvidence> bicycleRoute(
            BigDecimal originLatitude,
            BigDecimal originLongitude,
            BigDecimal destinationLatitude,
            BigDecimal destinationLongitude,
            String routeMode
    ) {
        return kakaoMapClient.fetchRoute(originLatitude, originLongitude, destinationLatitude, destinationLongitude,
                        "BICYCLE", routeMode)
                .map(route -> new RouteEvidence(route.distanceMeters(), route.durationSeconds(), route.travelMode(), routeMode,
                        route.pathPoints().stream().map(point -> new RoutePoint(point.latitude(), point.longitude())).toList()));
    }

    @Override
    public EnvironmentEvidence weather(BigDecimal latitude, BigDecimal longitude, OffsetDateTime arrivalAt) {
        WeatherForecastResult result = weatherService.getArrivalWeather(latitude, longitude, arrivalAt);
        return new EnvironmentEvidence(
                "kma-short-forecast",
                name(result.status()),
                result.announcedAt() != null ? result.announcedAt() : result.fetchedAt(),
                textFacts(
                        "skyStatus", result.skyStatus(),
                        "isRainy", string(result.isRainy()),
                        "arrivalAt", string(result.arrivalAt()),
                        "forecastAt", string(result.forecastAt()),
                        "announcedAt", string(result.announcedAt()),
                        "fetchedAt", string(result.fetchedAt())
                ),
                numericFacts(
                        "temperatureCelsius", decimal(result.temperature()),
                        "precipitationProbabilityPercent", decimal(result.pop()),
                        "precipitationTypeCode", decimal(result.pty())
                )
        );
    }

    @Override
    public EnvironmentEvidence airQuality(String stationId) {
        AirQualityResponse result = airQualityService.getAirQuality(stationId)
                .orElseGet(() -> AirQualityResponse.unavailable(stationId, null, null, null));
        return new EnvironmentEvidence(
                "air-korea",
                result.status(),
                result.measuredAt() != null ? result.measuredAt() : result.collectedAt(),
                textFacts(
                        "measurementStation", result.measurementStation() == null ? null : result.measurementStation().name(),
                        "khaiGrade", result.khai() == null ? null : result.khai().grade(),
                        "pm10Grade", result.pm10() == null ? null : result.pm10().grade(),
                        "pm25Grade", result.pm25() == null ? null : result.pm25().grade(),
                        "o3Grade", result.o3() == null ? null : result.o3().grade(),
                        "measuredAt", string(result.measuredAt()),
                        "collectedAt", string(result.collectedAt())
                ),
                numericFacts(
                        "measurementDistanceMeters", result.measurementStation() == null ? null : decimal(result.measurementStation().distanceMeters()),
                        "khai", result.khai() == null ? null : decimal(result.khai().value()),
                        "pm10", result.pm10() == null ? null : decimal(result.pm10().value()),
                        "pm25", result.pm25() == null ? null : decimal(result.pm25().value()),
                        "o3", result.o3() == null ? null : decimal(result.o3().value())
                )
        );
    }

    private String name(Enum<?> value) { return value == null ? "UNAVAILABLE" : value.name(); }
    private String string(Object value) { return value == null ? null : value.toString(); }
    private BigDecimal decimal(Number value) { return value == null ? null : new BigDecimal(value.toString()); }

    private Map<String, String> textFacts(String... entries) {
        Map<String, String> facts = new LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) {
            if (entries[index + 1] != null) facts.put(entries[index], entries[index + 1]);
        }
        return facts;
    }

    private Map<String, BigDecimal> numericFacts(Object... entries) {
        Map<String, BigDecimal> facts = new LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) {
            if (entries[index + 1] != null) facts.put((String) entries[index], (BigDecimal) entries[index + 1]);
        }
        return facts;
    }
}
