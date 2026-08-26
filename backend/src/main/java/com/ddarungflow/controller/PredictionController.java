package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.PredictionApiDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.retention.RetentionService;
import com.ddarungflow.notification.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
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
    private final NotificationService notificationService;

    public PredictionController(MapPredictionService mapPredictionService, RetentionService retentionService, NotificationService notificationService) {
        this.mapPredictionService = mapPredictionService;
        this.retentionService = retentionService;
        this.notificationService = notificationService;
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

        recordSuccessfulPrediction(principal, "ROUTE", results);
        return ResponseEntity.ok(results);
    }

    @PostMapping("/direct")
    @Operation(parameters = @Parameter(
        name = "X-CSRF-TOKEN",
        in = ParameterIn.HEADER,
        required = true,
        description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"
    ))
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

        recordSuccessfulPrediction(principal, "DIRECT", results);
        return ResponseEntity.ok(results);
    }

    private void recordSuccessfulPrediction(PrincipalDetails principal, String type, List<PredictionApiDtos.CandidatePredictionResponseDto> results) {
        if (principal == null) return;
        results.stream().filter(x -> x.predictionStatus() == PredictionApiDtos.PredictionStatus.NORMAL)
                .sorted(java.util.Comparator.comparing(PredictionApiDtos.CandidatePredictionResponseDto::predictionProbability, java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder()))
                        .thenComparingInt(PredictionApiDtos.CandidatePredictionResponseDto::durationSeconds).thenComparingInt(PredictionApiDtos.CandidatePredictionResponseDto::distanceMeters)
                        .thenComparing(PredictionApiDtos.CandidatePredictionResponseDto::stationId))
                .findFirst().ifPresent(candidate -> {
                    Long userId = principal.getUsers().getId();
                    retentionService.recordNormalPrediction(userId, type, candidate);
                    if (candidate.availabilityLevel() == PredictionApiDtos.AvailabilityLevel.HIGH) {
                        try { notificationService.evaluateArrivalRules(userId, candidate); } catch (NumberFormatException ignored) { }
                    }
                });
    }
}
