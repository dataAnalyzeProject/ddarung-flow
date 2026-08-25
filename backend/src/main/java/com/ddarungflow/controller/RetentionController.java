package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.dto.RetentionDtos;
import com.ddarungflow.retention.FavoriteStation;
import com.ddarungflow.retention.PredictionHistory;
import com.ddarungflow.retention.RetentionService;
import com.ddarungflow.retention.SavedRoute;
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
        return retentionService.getSavedRoutes(userId(principal)).stream().map(this::savedRouteResponse).toList();
    }

    @PostMapping("/saved-routes")
    @Operation(parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
            description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"))
    public RetentionDtos.SavedRouteResponse addSavedRoute(@AuthenticationPrincipal PrincipalDetails principal,
                                                           @RequestBody RetentionDtos.SavedRouteRequest request) {
        SavedRoute route = retentionService.addSavedRoute(userId(principal), request.name(), request.startStationId(),
                request.startStationName(), request.endStationId(), request.endStationName(), request.travelMode());
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
    public List<RetentionDtos.PredictionHistoryResponse> getPredictionHistories(@AuthenticationPrincipal PrincipalDetails principal) {
        return retentionService.getPredictionHistories(userId(principal)).stream().map(this::predictionHistoryResponse).toList();
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

    private RetentionDtos.SavedRouteResponse savedRouteResponse(SavedRoute route) {
        return new RetentionDtos.SavedRouteResponse(route.getId(), route.getName(), route.getStartStationId(),
                route.getStartStationName(), route.getEndStationId(), route.getEndStationName(), route.getTravelMode(), route.getCreatedAt().toString());
    }

    private RetentionDtos.PredictionHistoryResponse predictionHistoryResponse(PredictionHistory history) {
        return new RetentionDtos.PredictionHistoryResponse(history.getId(), history.getQueryCondition(),
                history.getSummaryResult(), history.getQueriedAt().toString());
    }
}
