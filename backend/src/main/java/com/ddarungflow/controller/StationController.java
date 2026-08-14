package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.StationQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/stations")
public class StationController {

    private final StationQueryService stationQueryService;

    public StationController(StationQueryService stationQueryService) {
        this.stationQueryService = stationQueryService;
    }

    @GetMapping
    public ResponseEntity<List<MapApiDtos.StationMapResponseDto>> getStationsInBounds(
        @RequestParam(name = "minLat", required = false) BigDecimal minLat,
        @RequestParam(name = "maxLat", required = false) BigDecimal maxLat,
        @RequestParam(name = "minLng", required = false) BigDecimal minLng,
        @RequestParam(name = "maxLng", required = false) BigDecimal maxLng
    ) {
        BigDecimal defaultMinLat = minLat != null ? minLat : new BigDecimal("37.0000000");
        BigDecimal defaultMaxLat = maxLat != null ? maxLat : new BigDecimal("38.0000000");
        BigDecimal defaultMinLng = minLng != null ? minLng : new BigDecimal("126.0000000");
        BigDecimal defaultMaxLng = maxLng != null ? maxLng : new BigDecimal("127.5000000");

        List<MapApiDtos.StationMapResponseDto> stations = stationQueryService.findInBounds(
            defaultMinLat, defaultMaxLat, defaultMinLng, defaultMaxLng
        );
        return ResponseEntity.ok(stations);
    }

    @GetMapping("/locations")
    public ResponseEntity<List<MapApiDtos.StationLocationResponseDto>> getStationLocations() {
        return ResponseEntity.ok(stationQueryService.findAllActiveLocations());
    }

    @GetMapping("/search")
    public ResponseEntity<List<MapApiDtos.StationMapResponseDto>> searchStations(
        @RequestParam(name = "query", required = false, defaultValue = "") String query,
        @RequestParam(name = "limit", required = false, defaultValue = "10") Integer limit
    ) {
        List<MapApiDtos.StationMapResponseDto> results = stationQueryService.searchByNameOrNumber(query, limit);
        return ResponseEntity.ok(results);
    }

    @GetMapping("/{stationId}")
    public ResponseEntity<MapApiDtos.StationMapResponseDto> getStationDetail(@PathVariable("stationId") String stationId) {
        return stationQueryService.findById(stationId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
