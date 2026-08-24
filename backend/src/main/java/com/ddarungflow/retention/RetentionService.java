package com.ddarungflow.retention;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RetentionService {

    public static final int MAX_FAVORITE_STATIONS = 20;
    public static final int MAX_SAVED_ROUTES = 10;
    public static final int MAX_PREDICTION_HISTORIES = 30;

    private final FavoriteStationRepository favoriteStationRepository;
    private final SavedRouteRepository savedRouteRepository;
    private final PredictionHistoryRepository predictionHistoryRepository;

    @Transactional
    public FavoriteStation addFavoriteStation(Long userId, Long stationId, String stationName) {
        if (userId == null || stationId == null) {
            throw new IllegalArgumentException("userId와 stationId는 필수입니다.");
        }

        // 멱등성: 이미 즐겨찾기에 존재하는 경우 기존 항목 반환 (행을 늘리지 않음)
        Optional<FavoriteStation> existing = favoriteStationRepository.findByUserIdAndStationId(userId, stationId);
        if (existing.isPresent()) {
            return existing.get();
        }

        // 최대 20개 강제 (21번째는 거부)
        long currentCount = favoriteStationRepository.countByUserId(userId);
        if (currentCount >= MAX_FAVORITE_STATIONS) {
            throw new IllegalStateException("즐겨찾기 대여소는 최대 " + MAX_FAVORITE_STATIONS + "개까지 저장할 수 있습니다.");
        }

        FavoriteStation favorite = FavoriteStation.builder()
                .userId(userId)
                .stationId(stationId)
                .stationName(stationName)
                .build();

        return favoriteStationRepository.save(favorite);
    }

    public List<FavoriteStation> getFavoriteStations(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        return favoriteStationRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void deleteFavoriteStation(Long userId, Long favoriteId) {
        if (userId == null || favoriteId == null) {
            throw new IllegalArgumentException("userId와 favoriteId는 필수입니다.");
        }
        FavoriteStation favorite = favoriteStationRepository.findByUserIdAndId(userId, favoriteId)
                .orElseThrow(() -> new IllegalArgumentException("해당 사용자의 즐겨찾기 항목을 찾을 수 없습니다."));
        favoriteStationRepository.delete(favorite);
    }

    @Transactional
    public SavedRoute addSavedRoute(Long userId, String name, Long startStationId, String startStationName,
                                    Long endStationId, String endStationName, String travelMode) {
        if (userId == null || name == null || name.isBlank() || startStationId == null || endStationId == null) {
            throw new IllegalArgumentException("필수 저장 경로 정보가 누락되었습니다.");
        }

        // 최대 10개 강제 (11번째는 거부)
        long currentCount = savedRouteRepository.countByUserId(userId);
        if (currentCount >= MAX_SAVED_ROUTES) {
            throw new IllegalStateException("저장 경로는 최대 " + MAX_SAVED_ROUTES + "개까지 저장할 수 있습니다.");
        }

        SavedRoute route = SavedRoute.builder()
                .userId(userId)
                .name(name)
                .startStationId(startStationId)
                .startStationName(startStationName)
                .endStationId(endStationId)
                .endStationName(endStationName)
                .travelMode(travelMode)
                .build();

        return savedRouteRepository.save(route);
    }

    public List<SavedRoute> getSavedRoutes(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        return savedRouteRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void deleteSavedRoute(Long userId, Long routeId) {
        if (userId == null || routeId == null) {
            throw new IllegalArgumentException("userId와 routeId는 필수입니다.");
        }
        SavedRoute route = savedRouteRepository.findByUserIdAndId(userId, routeId)
                .orElseThrow(() -> new IllegalArgumentException("해당 사용자의 저장 경로를 찾을 수 없습니다."));
        savedRouteRepository.delete(route);
    }

    @Transactional
    public PredictionHistory recordPredictionHistory(Long userId, String queryCondition, String summaryResult) {
        if (userId == null || queryCondition == null || summaryResult == null) {
            throw new IllegalArgumentException("조회 이력 정보는 필수입니다.");
        }

        PredictionHistory history = PredictionHistory.builder()
                .userId(userId)
                .queryCondition(queryCondition)
                .summaryResult(summaryResult)
                .build();

        return predictionHistoryRepository.save(history);
    }

    public List<PredictionHistory> getPredictionHistories(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        // 최신 30건만 반환 강제
        return predictionHistoryRepository.findByUserIdOrderByQueriedAtDesc(userId, PageRequest.of(0, MAX_PREDICTION_HISTORIES));
    }
}
