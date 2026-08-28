package com.ddarungflow.dto;

import java.math.BigDecimal;

public final class RetentionDtos {

    private RetentionDtos() {
    }

    public record FavoriteRequest(Long stationId, String stationName) {
    }

    public record FavoriteResponse(Long id, Long stationId, String stationName, String createdAt) {
    }

    public record SavedRouteRequest(String kind, String originName, BigDecimal originLatitude, BigDecimal originLongitude,
                                    String destinationName, BigDecimal destinationLatitude, BigDecimal destinationLongitude,
                                    String stationId, String travelMode, Integer directMinutes, Integer requiredBikeCount) {
    }

    public record SavedRouteResponse(Long id, String kind, String displayName, boolean replayable,
                                     SavedRouteRequest routeInput, String createdAt) {
    }

    public record PredictionHistoryResponse(Long id, String queryCondition, String summaryResult, String queriedAt,
                                            String stationId, String stationName, String availabilityLevel,
                                            String predictionStatus, String predictionTargetAt, Integer requiredBikeCount,
                                            Integer actualBikeCount, String outcome, String scoredAt) {
    }

    public record PredictionScoreLevelSummary(long scoredCount, long hitCount) {
    }

    public record PredictionScoreSummary(long scoredCount, long hitCount, double hitRate,
                                         java.util.Map<String, PredictionScoreLevelSummary> byLevel) {
    }

    public record PredictionHistoriesResponse(java.util.List<PredictionHistoryResponse> items,
                                              PredictionScoreSummary scoreSummary) {
    }

    public record AlertRuleRequest(Long stationId, String conditionType, Integer threshold, Boolean enabled) {
    }

    public record AlertRuleResponse(Long id, Long stationId, String conditionType, Integer threshold,
                                    boolean enabled, String createdAt) {
    }

    public record NotificationResponse(Long id, String title, String message, String createdAt, String readAt) {
    }
}
