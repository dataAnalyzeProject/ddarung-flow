package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.dto.RetentionDtos;
import com.ddarungflow.retention.FavoriteStation;
import com.ddarungflow.retention.PredictionHistory;
import com.ddarungflow.retention.RetentionService;
import com.ddarungflow.retention.SavedRoute;
import com.ddarungflow.retention.SavedPredictionRoute;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class RetentionController {

    private final RetentionService retentionService;

    @GetMapping("/favorites")
    public List<RetentionDtos.FavoriteResponse> getFavorites(@AuthenticationPrincipal PrincipalDetails principal) {
        return retentionService.getFavoriteStations(userId(principal)).stream().map(this::favoriteResponse).toList();
    }

    @PostMapping("/favorites")
    @Operation(parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
            description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"))
    public RetentionDtos.FavoriteResponse addFavorite(@AuthenticationPrincipal PrincipalDetails principal,
                                                       @RequestBody RetentionDtos.FavoriteRequest request) {
        FavoriteStation favorite = retentionService.addFavoriteStation(userId(principal), request.stationId(), request.stationName());
        return favoriteResponse(favorite);
    }

    @DeleteMapping("/favorites/{id}")
    @Operation(parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
            description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"))
    public ResponseEntity<Void> deleteFavorite(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) {
        retentionService.deleteFavoriteStation(userId(principal), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/saved-routes")
    public List<RetentionDtos.SavedRouteResponse> getSavedRoutes(@AuthenticationPrincipal PrincipalDetails principal) {
        List<RetentionDtos.SavedRouteResponse> current = retentionService.getSavedPredictionRoutes(userId(principal)).stream().map(this::savedRouteResponse).toList();
        List<RetentionDtos.SavedRouteResponse> legacy = retentionService.getSavedRoutes(userId(principal)).stream().map(this::legacySavedRouteResponse).toList();
        return java.util.stream.Stream.concat(current.stream(), legacy.stream()).toList();
    }

    @PostMapping("/saved-routes")
    @Operation(parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
            description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"))
    public RetentionDtos.SavedRouteResponse addSavedRoute(@AuthenticationPrincipal PrincipalDetails principal,
                                                           @RequestBody RetentionDtos.SavedRouteRequest request) {
        SavedPredictionRoute route = retentionService.addSavedRoute(userId(principal), request.kind(), request.originName(), request.originLatitude(), request.originLongitude(), request.destinationName(), request.destinationLatitude(), request.destinationLongitude(), request.stationId(), request.travelMode(), request.directMinutes(), request.requiredBikeCount());
        return savedRouteResponse(route);
    }

    @DeleteMapping("/saved-routes/{id}")
    @Operation(parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
            description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"))
    public ResponseEntity<Void> deleteSavedRoute(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) {
        retentionService.deleteSavedRoute(userId(principal), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/prediction-histories")
    public RetentionDtos.PredictionHistoriesResponse getPredictionHistories(@AuthenticationPrincipal PrincipalDetails principal) {
        Long userId = userId(principal);
        return new RetentionDtos.PredictionHistoriesResponse(retentionService.getPredictionHistories(userId).stream().map(this::predictionHistoryResponse).toList(), scoreSummary(retentionService.getPredictionScoreSummary(userId)));
    }

    @DeleteMapping("/prediction-histories/{id}")
    @Operation(parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
            description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"))
    public ResponseEntity<Void> deletePredictionHistory(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) {
        retentionService.deletePredictionHistory(userId(principal), id);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(RetentionService.RetentionNotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(404).body(Map.of("code", "RETENTION_NOT_FOUND"));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> conflict(IllegalStateException exception) {
        String code = exception.getMessage().contains("즐겨찾기")
                ? "FAVORITE_LIMIT_REACHED"
                : "SAVED_ROUTE_LIMIT_REACHED";
        return ResponseEntity.status(409).body(Map.of("code", code));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalidRequest() {
        return ResponseEntity.badRequest().body(Map.of("code", "INVALID_REQUEST"));
    }

    private Long userId(PrincipalDetails principal) {
        return principal.getUsers().getId();
    }

    private RetentionDtos.FavoriteResponse favoriteResponse(FavoriteStation favorite) {
        return new RetentionDtos.FavoriteResponse(favorite.getId(), favorite.getStationId(), favorite.getStationName(), favorite.getCreatedAt().toString());
    }

    private RetentionDtos.SavedRouteResponse savedRouteResponse(SavedPredictionRoute route) {
        RetentionDtos.SavedRouteRequest input = new RetentionDtos.SavedRouteRequest(route.getKind(), route.getOriginName(), route.getOriginLatitude(), route.getOriginLongitude(), route.getDestinationName(), route.getDestinationLatitude(), route.getDestinationLongitude(), route.getStationId(), route.getTravelMode(), route.getDirectMinutes(), route.getRequiredBikeCount());
        return new RetentionDtos.SavedRouteResponse(route.getId(), route.getKind(), route.getDisplayName(), true, input, route.getCreatedAt().toString());
    }
    private RetentionDtos.SavedRouteResponse legacySavedRouteResponse(SavedRoute route) {
        return new RetentionDtos.SavedRouteResponse(route.getId(), "LEGACY_STATION_ROUTE", route.getName(), false, null, route.getCreatedAt().toString());
    }

    private RetentionDtos.PredictionHistoryResponse predictionHistoryResponse(PredictionHistory history) {
        return new RetentionDtos.PredictionHistoryResponse(history.getId(), history.getQueryCondition(),
                history.getSummaryResult(), history.getQueriedAt().toString(), history.getStationId(), history.getStationName(),
                history.getAvailabilityLevel(), history.getPredictionStatus(), history.getPredictionTargetAt() == null ? null : history.getPredictionTargetAt().toString(),
                history.getRequiredBikeCount(), history.getActualBikeCount(), history.getOutcome(), history.getScoredAt() == null ? null : history.getScoredAt().toString());
    }

    private RetentionDtos.PredictionScoreSummary scoreSummary(RetentionService.RetentionScoreSummary summary) {
        if (summary == null) return null;
        Map<String, RetentionDtos.PredictionScoreLevelSummary> byLevel = new java.util.LinkedHashMap<>();
        for (String level : List.of("HIGH", "MEDIUM", "LOW")) {
            RetentionService.ScoreLevel score = summary.byLevel().getOrDefault(level, new RetentionService.ScoreLevel(0, 0));
            byLevel.put(level, new RetentionDtos.PredictionScoreLevelSummary(score.scoredCount(), score.hitCount()));
        }
        return new RetentionDtos.PredictionScoreSummary(summary.scoredCount(), summary.hitCount(), summary.hitRate(), byLevel);
    }
}
