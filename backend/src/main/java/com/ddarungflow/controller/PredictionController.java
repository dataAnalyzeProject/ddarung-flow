package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.PredictionApiDtos;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/predictions")
public class PredictionController {

    private final MapPredictionService mapPredictionService;

    public PredictionController(MapPredictionService mapPredictionService) {
        this.mapPredictionService = mapPredictionService;
    }

    @PostMapping("/route")
    public ResponseEntity<List<PredictionApiDtos.CandidatePredictionResponseDto>> getRoutePredictions(
        @RequestBody MapApiDtos.RouteCandidateRequestDto request
    ) {
        if (request == null || request.destinationLatitude() == null || request.destinationLongitude() == null) {
            return ResponseEntity.badRequest().build();
        }

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildRouteCandidates(
            request.originLatitude(),
            request.originLongitude(),
            request.destinationLatitude(),
            request.destinationLongitude(),
            request.travelMode(),
            request.minutesAhead(),
            request.requiredBikeCount()
        );

        return ResponseEntity.ok(results);
    }

    @PostMapping("/direct")
    public ResponseEntity<List<PredictionApiDtos.CandidatePredictionResponseDto>> getDirectPredictions(
        @RequestBody PredictionApiDtos.PredictionDirectRequestDto request
    ) {
        if (request == null || request.stationId() == null || request.stationId().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildDirectRoute(
            request.stationId(),
            request.originLatitude(),
            request.originLongitude(),
            request.travelMode(),
            request.minutesAhead(),
            request.requiredBikeCount()
        );

        return ResponseEntity.ok(results);
    }
}
