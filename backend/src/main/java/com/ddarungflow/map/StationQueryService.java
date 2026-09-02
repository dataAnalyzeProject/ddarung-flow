package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Service
public class StationQueryService {

    private final StationRepository stationRepository;
    private final StationInventoryCurrentRepository inventoryRepository;

    public StationQueryService(StationRepository stationRepository, StationInventoryCurrentRepository inventoryRepository) {
        this.stationRepository = stationRepository;
        this.inventoryRepository = inventoryRepository;
    }

    public List<MapApiDtos.StationMapResponseDto> findInBounds(BigDecimal minLat, BigDecimal maxLat, BigDecimal minLng, BigDecimal maxLng) {
        if (minLat != null && maxLat != null && minLat.compareTo(maxLat) >= 0) {
            return List.of();
        }
        if (minLng != null && maxLng != null && minLng.compareTo(maxLng) >= 0) {
            return List.of();
        }
        List<Station> stations = stationRepository.findActiveInBounds(minLat, maxLat, minLng, maxLng);
        return stations.stream().limit(20).map(this::toStationMapResponseDto).toList();
    }

    public List<MapApiDtos.StationLocationResponseDto> findAllActiveLocations() {
        return stationRepository.findByActiveTrue().stream()
            .map(station -> new MapApiDtos.StationLocationResponseDto(
                station.getStationId(), station.getStationNumber(), station.getName(), station.getLatitude(), station.getLongitude()
            ))
            .toList();
    }

    public List<MapApiDtos.StationMapResponseDto> searchByNameOrNumber(String query) {
        return searchByNameOrNumber(query, 10);
    }

    public List<MapApiDtos.StationMapResponseDto> searchByNameOrNumber(String query, Integer limit) {
        if (query == null) {
            return List.of();
        }
        String trimmed = query.trim();
        if (trimmed.length() < 2) {
            return List.of();
        }
        if (trimmed.length() > 50) {
            trimmed = trimmed.substring(0, 50);
        }
        int effectiveLimit = (limit == null || limit < 1) ? 10 : Math.min(limit, 20);
        List<Station> stations = stationRepository.searchActiveByNameOrNumber(trimmed);
        return stations.stream().limit(effectiveLimit).map(this::toStationMapResponseDto).toList();
    }

    public Optional<MapApiDtos.StationMapResponseDto> findById(String stationId) {
        return stationRepository.findById(stationId).map(this::toStationMapResponseDto);
    }

    public Optional<MapApiDtos.StationLocationResponseDto> findActiveLocation(String stationId) {
        return stationRepository.findById(stationId)
            .filter(Station::isActive)
            .map(station -> new MapApiDtos.StationLocationResponseDto(
                station.getStationId(),
                station.getStationNumber(),
                station.getName(),
                station.getLatitude(),
                station.getLongitude()
            ));
    }

    public MapApiDtos.StationMapResponseDto toStationMapResponseDto(Station station) {
        Optional<StationInventoryCurrent> inv = inventoryRepository.findById(station.getStationId());
        return new MapApiDtos.StationMapResponseDto(
            station.getStationId(),
            station.getStationNumber(),
            station.getName(),
            station.getLatitude(),
            station.getLongitude(),
            inv.map(StationInventoryCurrent::getAvailableBikeCount).orElse(null),
            inv.map(StationInventoryCurrent::getCollectedAt).orElse(null),
            inv.map(StationInventoryCurrent::getInventoryStatus).orElse(InventoryStatus.MISSING)
        );
    }
}
