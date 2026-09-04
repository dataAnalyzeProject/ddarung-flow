package com.ddarungflow.map;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class NearbyPlaceService {

    private static final int MAX_LIMIT = 5;

    private final StationQueryService stationQueryService;
    private final KakaoMapClient kakaoMapClient;

    public NearbyPlaceService(StationQueryService stationQueryService, KakaoMapClient kakaoMapClient) {
        this.stationQueryService = stationQueryService;
        this.kakaoMapClient = kakaoMapClient;
    }

    public List<MapApiDtos.NearbyPlaceResponseDto> findNearby(String stationId, String theme, Integer limit) {
        if (stationId == null || stationId.isBlank()) {
            throw new IllegalArgumentException("stationId is required");
        }
        Theme parsedTheme = parseTheme(theme);
        int effectiveLimit = effectiveLimit(limit);

        MapApiDtos.StationLocationResponseDto station = stationQueryService.findActiveLocation(stationId)
            .orElseThrow(StationNotFoundException::new);

        return search(parsedTheme, station.latitude(), station.longitude(), effectiveLimit);
    }

    /**
     * The same theme search centred on an explicit point. Journey planning rents at the rider's origin
     * but looks for stops around the destination, so its POI search is not anchored to the station.
     */
    public List<MapApiDtos.NearbyPlaceResponseDto> findNearbyAt(
        BigDecimal latitude,
        BigDecimal longitude,
        String theme,
        Integer limit
    ) {
        if (latitude == null || longitude == null) {
            throw new IllegalArgumentException("latitude and longitude are required");
        }
        return search(parseTheme(theme), latitude, longitude, effectiveLimit(limit));
    }

    private int effectiveLimit(Integer limit) {
        int effectiveLimit = limit == null ? MAX_LIMIT : limit;
        if (effectiveLimit < 1 || effectiveLimit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and 5");
        }
        return effectiveLimit;
    }

    private List<MapApiDtos.NearbyPlaceResponseDto> search(
        Theme theme,
        BigDecimal latitude,
        BigDecimal longitude,
        int limit
    ) {
        return switch (theme) {
            case CAFE -> kakaoMapClient.searchNearbyByCategory("CE7", latitude, longitude, limit);
            case FOOD -> kakaoMapClient.searchNearbyByCategory("FD6", latitude, longitude, limit);
            case CULTURE -> kakaoMapClient.searchNearbyByCategory("CT1", latitude, longitude, limit);
            case ATTRACTION -> kakaoMapClient.searchNearbyByCategory("AT4", latitude, longitude, limit);
            case PARK -> kakaoMapClient.searchNearbyByKeyword("공원", latitude, longitude, limit);
            case RIVER -> kakaoMapClient.searchNearbyByKeyword("한강공원", latitude, longitude, limit);
        };
    }

    private Theme parseTheme(String theme) {
        if (theme == null || theme.isBlank()) {
            throw new IllegalArgumentException("theme is required");
        }
        try {
            return Theme.valueOf(theme.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("unsupported theme");
        }
    }

    enum Theme {
        PARK,
        RIVER,
        CAFE,
        ATTRACTION,
        CULTURE,
        FOOD
    }

    public static class StationNotFoundException extends RuntimeException {
    }
}
