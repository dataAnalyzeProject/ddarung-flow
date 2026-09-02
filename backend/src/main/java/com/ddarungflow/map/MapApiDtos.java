package com.ddarungflow.map;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ddarungflow.inventory.InventoryStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public class MapApiDtos {

    public record StationLocationResponseDto(
        String stationId,
        String stationNumber,
        String name,
        BigDecimal latitude,
        BigDecimal longitude
    ) {}

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

    public record PlaceSearchPageResponseDto(
        List<PlaceSearchResponseDto> places,
        int page,
        boolean hasNext
    ) {}

    public record NearbyPlaceResponseDto(
        String placeId,
        String name,
        String address,
        String category,
        BigDecimal latitude,
        BigDecimal longitude,
        int distanceMeters
    ) {}

    public record RouteResultDto(
        int distanceMeters,
        int durationSeconds,
        String travelMode,
        List<RoutePointDto> pathPoints,
        @JsonInclude(JsonInclude.Include.NON_EMPTY)
        Integer transfers,
        @JsonInclude(JsonInclude.Include.NON_EMPTY)
        Integer fare,
        @JsonInclude(JsonInclude.Include.NON_EMPTY)
        List<RouteStepDto> steps
    ) {}

    public record RoutePointDto(BigDecimal latitude, BigDecimal longitude) {}

    public record RouteStepDto(
        String type,
        String guidance,
        Integer distanceMeters,
        Integer durationSeconds,
        List<RouteStopDto> stops,
        List<RouteVehicleDto> vehicles,
        List<RoutePointDto> pathPoints
    ) {}

    public record RouteStopDto(String name, BigDecimal latitude, BigDecimal longitude) {}

    public record RouteVehicleDto(String name, String type) {}

    public record RouteEstimateRequestDto(
        BigDecimal originLatitude,
        BigDecimal originLongitude,
        BigDecimal destinationLatitude,
        BigDecimal destinationLongitude,
        String travelMode,
        String routeMode
    ) {}

    public record ProviderErrorResponseDto(String code, String message) {}

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
