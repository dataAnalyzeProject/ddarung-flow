package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.PredictionApiDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.retention.RetentionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/predictions")
public class PredictionController {

    private final MapPredictionService mapPredictionService;
    private final RetentionService retentionService;

    public PredictionController(MapPredictionService mapPredictionService, RetentionService retentionService) {
        this.mapPredictionService = mapPredictionService;
        this.retentionService = retentionService;
    }

    @PostMapping("/route")
    public ResponseEntity<List<PredictionApiDtos.CandidatePredictionResponseDto>> getRoutePredictions(
        @RequestBody MapApiDtos.RouteCandidateRequestDto request,
        @AuthenticationPrincipal PrincipalDetails principal
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

        recordSuccessfulHistory(principal, "ROUTE", results.size());
        return ResponseEntity.ok(results);
    }

    @PostMapping("/direct")
    public ResponseEntity<List<PredictionApiDtos.CandidatePredictionResponseDto>> getDirectPredictions(
        @RequestBody PredictionApiDtos.PredictionDirectRequestDto request,
        @AuthenticationPrincipal PrincipalDetails principal
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

        recordSuccessfulHistory(principal, "DIRECT", results.size());
        return ResponseEntity.ok(results);
    }

    private void recordSuccessfulHistory(PrincipalDetails principal, String type, int resultCount) {
        if (principal != null && resultCount > 0) {
            retentionService.recordPredictionHistory(principal.getUsers().getId(), type, "추천 결과 " + resultCount + "건");
        }
    }
}
