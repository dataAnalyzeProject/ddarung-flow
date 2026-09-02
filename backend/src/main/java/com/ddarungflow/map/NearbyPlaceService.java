package com.ddarungflow.map;

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
        int effectiveLimit = limit == null ? MAX_LIMIT : limit;
        if (effectiveLimit < 1 || effectiveLimit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and 5");
        }

        MapApiDtos.StationLocationResponseDto station = stationQueryService.findActiveLocation(stationId)
            .orElseThrow(StationNotFoundException::new);

        return switch (parsedTheme) {
            case CAFE -> kakaoMapClient.searchNearbyByCategory(
                "CE7", station.latitude(), station.longitude(), effectiveLimit);
            case FOOD -> kakaoMapClient.searchNearbyByCategory(
                "FD6", station.latitude(), station.longitude(), effectiveLimit);
            case CULTURE -> kakaoMapClient.searchNearbyByCategory(
                "CT1", station.latitude(), station.longitude(), effectiveLimit);
            case ATTRACTION -> kakaoMapClient.searchNearbyByCategory(
                "AT4", station.latitude(), station.longitude(), effectiveLimit);
            case PARK -> kakaoMapClient.searchNearbyByKeyword(
                "공원", station.latitude(), station.longitude(), effectiveLimit);
            case RIVER -> kakaoMapClient.searchNearbyByKeyword(
                "한강공원", station.latitude(), station.longitude(), effectiveLimit);
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
