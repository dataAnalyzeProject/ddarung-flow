package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.PredictionApiDtos;
import com.ddarungflow.map.KakaoMapClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/routes")
public class RouteController {

    private final MapPredictionService mapPredictionService;
    private final KakaoMapClient kakaoMapClient;

    public RouteController(MapPredictionService mapPredictionService, KakaoMapClient kakaoMapClient) {
        this.mapPredictionService = mapPredictionService;
        this.kakaoMapClient = kakaoMapClient;
    }

    @PostMapping("/estimate")
    public ResponseEntity<?> estimateRoute(@RequestBody MapApiDtos.RouteEstimateRequestDto request) {
        if (!isValidEstimate(request)) {
            return ResponseEntity.badRequest().build();
        }

        try {
            return ResponseEntity.ok(kakaoMapClient.fetchRoute(
                request.originLatitude(),
                request.originLongitude(),
                request.destinationLatitude(),
                request.destinationLongitude(),
                request.travelMode(),
                request.routeMode()
            ).orElseThrow(() -> new KakaoMapClient.ProviderException("ROUTE_PROVIDER_ERROR")));
        } catch (KakaoMapClient.ProviderException e) {
            return ResponseEntity.status(502).body(
                new MapApiDtos.ProviderErrorResponseDto("ROUTE_PROVIDER_ERROR", "경로 제공자를 사용할 수 없습니다.")
            );
        }
    }

    @PostMapping("/candidates")
    public ResponseEntity<List<PredictionApiDtos.CandidatePredictionResponseDto>> getRouteCandidates(
        @RequestBody MapApiDtos.RouteCandidateRequestDto request
    ) {
        if (request == null || request.destinationLatitude() == null || request.destinationLongitude() == null) {
            return ResponseEntity.badRequest().build();
        }

        List<PredictionApiDtos.CandidatePredictionResponseDto> candidates = mapPredictionService.buildRouteCandidates(
            request.originLatitude(),
            request.originLongitude(),
            request.destinationLatitude(),
            request.destinationLongitude(),
            request.travelMode(),
            request.minutesAhead(),
            request.requiredBikeCount()
        );

        return ResponseEntity.ok(candidates);
    }

    private boolean isValidEstimate(MapApiDtos.RouteEstimateRequestDto request) {
        if (request == null || request.originLatitude() == null || request.originLongitude() == null
            || request.destinationLatitude() == null || request.destinationLongitude() == null
            || request.travelMode() == null) {
            return false;
        }
        boolean coordinatesValid = validLatitude(request.originLatitude())
            && validLatitude(request.destinationLatitude())
            && validLongitude(request.originLongitude())
            && validLongitude(request.destinationLongitude());
        String mode = request.travelMode().toUpperCase(java.util.Locale.ROOT);
        if (!coordinatesValid || !("WALK".equals(mode) || "PUBLIC_TRANSIT".equals(mode) || "BICYCLE".equals(mode))) {
            return false;
        }

        String routeMode = request.routeMode();
        if (!"BICYCLE".equals(mode)) {
            return routeMode == null || routeMode.isBlank();
        }
        if (routeMode == null || routeMode.isBlank()) {
            return false;
        }
        return switch (routeMode.toUpperCase(java.util.Locale.ROOT)) {
            case "BIKE_ONLY", "ACCESSIBLE", "SHORTEST" -> true;
            default -> false;
        };
    }

    private boolean validLatitude(java.math.BigDecimal value) {
        return value.compareTo(java.math.BigDecimal.valueOf(-90)) >= 0
            && value.compareTo(java.math.BigDecimal.valueOf(90)) <= 0;
    }

    private boolean validLongitude(java.math.BigDecimal value) {
        return value.compareTo(java.math.BigDecimal.valueOf(-180)) >= 0
            && value.compareTo(java.math.BigDecimal.valueOf(180)) <= 0;
    }
}
