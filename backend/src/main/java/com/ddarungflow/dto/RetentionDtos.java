package com.ddarungflow.dto;

public final class RetentionDtos {

    private RetentionDtos() {
    }

    public record FavoriteRequest(Long stationId, String stationName) {
    }

    public record FavoriteResponse(Long id, Long stationId, String stationName, String createdAt) {
    }

    public record SavedRouteRequest(String name, Long startStationId, String startStationName,
                                    Long endStationId, String endStationName, String travelMode) {
    }

    public record SavedRouteResponse(Long id, String name, Long startStationId, String startStationName,
                                     Long endStationId, String endStationName, String travelMode, String createdAt) {
    }

    public record PredictionHistoryResponse(Long id, String queryCondition, String summaryResult, String queriedAt) {
    }

    public record AlertRuleRequest(Long stationId, String conditionType, Integer threshold, Boolean enabled) {
    }

    public record AlertRuleResponse(Long id, Long stationId, String conditionType, Integer threshold,
                                    boolean enabled, String createdAt) {
    }

    public record NotificationResponse(Long id, String title, String message, String createdAt, String readAt) {
    }
}
