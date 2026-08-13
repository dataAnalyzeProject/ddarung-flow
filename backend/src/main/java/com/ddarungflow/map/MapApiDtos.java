package com.ddarungflow.map;

import com.ddarungflow.inventory.InventoryStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public class MapApiDtos {

    public record StationMapResponseDto(
        String stationId,
        String stationNumber,
        String name,
        BigDecimal latitude,
        BigDecimal longitude,
        Integer availableBikeCount,
        OffsetDateTime collectedAt,
        InventoryStatus inventoryStatus
    ) {}

    public record PlaceSearchResponseDto(
        String placeId,
        String name,
        String address,
        BigDecimal latitude,
        BigDecimal longitude
    ) {}

    public record RouteResultDto(
        int distanceMeters,
        int durationSeconds,
        String travelMode
    ) {}

    public record RouteCandidateRequestDto(
        BigDecimal originLatitude,
        BigDecimal originLongitude,
        BigDecimal destinationLatitude,
        BigDecimal destinationLongitude,
        String travelMode,
        Integer minutesAhead,
        Integer requiredBikeCount
    ) {}
}
