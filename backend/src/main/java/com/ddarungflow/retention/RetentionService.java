package com.ddarungflow.retention;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.math.BigDecimal;
import com.ddarungflow.map.PredictionApiDtos;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RetentionService {

    public static final int MAX_FAVORITE_STATIONS = 20;
    public static final int MAX_SAVED_ROUTES = 10;
    public static final int MAX_PREDICTION_HISTORIES = 30;

    private final FavoriteStationRepository favoriteStationRepository;
    private final SavedRouteRepository savedRouteRepository;
    private final SavedPredictionRouteRepository savedPredictionRouteRepository;
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
                .orElseThrow(RetentionNotFoundException::new);
        favoriteStationRepository.delete(favorite);
    }

    @Transactional
    public SavedPredictionRoute addSavedRoute(Long userId, String kind, String originName, BigDecimal originLatitude,
                                               BigDecimal originLongitude, String destinationName, BigDecimal destinationLatitude,
                                               BigDecimal destinationLongitude, String stationId, String travelMode,
                                               Integer directMinutes, Integer requiredBikeCount) {
        if (userId == null || originName == null || originName.isBlank() || originLatitude == null || originLongitude == null
                || requiredBikeCount == null || requiredBikeCount < 1 || requiredBikeCount > 5
                || !("WALK".equals(travelMode) || "PUBLIC_TRANSIT".equals(travelMode))) {
            throw new IllegalArgumentException("필수 저장 경로 정보가 누락되었습니다.");
        }
        boolean route = "ROUTE".equals(kind);
        boolean direct = "DIRECT".equals(kind);
        if ((!route && !direct) || (route && (destinationName == null || destinationName.isBlank() || destinationLatitude == null || destinationLongitude == null))
                || (direct && (stationId == null || stationId.isBlank() || directMinutes == null || directMinutes < 1 || directMinutes > 240))) {
            throw new IllegalArgumentException("저장 경로 형식이 올바르지 않습니다.");
        }
        String key = String.join("|", kind, originName, originLatitude.toPlainString(), originLongitude.toPlainString(),
                String.valueOf(destinationName), String.valueOf(destinationLatitude), String.valueOf(destinationLongitude),
                String.valueOf(stationId), travelMode, String.valueOf(directMinutes), requiredBikeCount.toString());
        Optional<SavedPredictionRoute> existing = savedPredictionRouteRepository.findByUserIdAndRouteKey(userId, key);
        if (existing.isPresent()) return existing.get();
        long currentCount = savedPredictionRouteRepository.countByUserId(userId);
        if (currentCount >= MAX_SAVED_ROUTES) {
            throw new IllegalStateException("저장 경로는 최대 " + MAX_SAVED_ROUTES + "개까지 저장할 수 있습니다.");
        }
        String displayName = originName + " → " + (route ? destinationName : stationId);
        SavedPredictionRoute routeEntity = SavedPredictionRoute.builder()
                .userId(userId).kind(kind).displayName(displayName).originName(originName).originLatitude(originLatitude).originLongitude(originLongitude)
                .destinationName(destinationName).destinationLatitude(destinationLatitude).destinationLongitude(destinationLongitude).stationId(stationId)
                .travelMode(travelMode).directMinutes(directMinutes).requiredBikeCount(requiredBikeCount).routeKey(key)
                .build();
        return savedPredictionRouteRepository.save(routeEntity);
    }

    /** Legacy writer retained only for V1 compatibility tests; new API writes saved_prediction_routes. */
    @Deprecated
    public SavedRoute addSavedRoute(Long userId, String name, Long startStationId, String startStationName,
                                    Long endStationId, String endStationName, String travelMode) {
        if (savedRouteRepository.countByUserId(userId) >= MAX_SAVED_ROUTES) throw new IllegalStateException("저장 경로는 최대 " + MAX_SAVED_ROUTES + "개까지 저장할 수 있습니다.");
        return savedRouteRepository.save(SavedRoute.builder().userId(userId).name(name).startStationId(startStationId)
                .startStationName(startStationName).endStationId(endStationId).endStationName(endStationName).travelMode(travelMode).build());
    }

    public List<SavedPredictionRoute> getSavedPredictionRoutes(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        return savedPredictionRouteRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public List<SavedRoute> getSavedRoutes(Long userId) {
        if (userId == null) throw new IllegalArgumentException("userId는 필수입니다.");
        return savedRouteRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void deleteSavedRoute(Long userId, Long routeId) {
        if (userId == null || routeId == null) {
            throw new IllegalArgumentException("userId와 routeId는 필수입니다.");
        }
        Optional<SavedPredictionRoute> current = savedPredictionRouteRepository == null ? Optional.empty() : Optional.ofNullable(savedPredictionRouteRepository.findByUserIdAndId(userId, routeId)).orElse(Optional.empty());
        if (current.isPresent()) { savedPredictionRouteRepository.delete(current.get()); return; }
        SavedRoute legacy = savedRouteRepository.findByUserIdAndId(userId, routeId).orElseThrow(RetentionNotFoundException::new);
        savedRouteRepository.delete(legacy);
    }

    @Transactional
    public PredictionHistory recordPredictionHistory(Long userId, String queryCondition, String summaryResult) {
        if (userId == null || queryCondition == null || summaryResult == null) {
            throw new IllegalArgumentException("조회 이력 정보는 필수입니다.");
        }

        if (predictionHistoryRepository.countByUserId(userId) >= MAX_PREDICTION_HISTORIES) {
            predictionHistoryRepository.findFirstByUserIdOrderByQueriedAtAsc(userId)
                    .ifPresent(predictionHistoryRepository::delete);
        }

        PredictionHistory history = PredictionHistory.builder()
                .userId(userId)
                .queryCondition(queryCondition)
                .summaryResult(summaryResult)
                .build();

        return predictionHistoryRepository.save(history);
    }

    @Transactional
    public void recordNormalPrediction(Long userId, String type, PredictionApiDtos.CandidatePredictionResponseDto candidate) {
        if (candidate == null || candidate.predictionStatus() != PredictionApiDtos.PredictionStatus.NORMAL) return;
        PredictionHistory history = recordPredictionHistory(userId, type, "추천 결과");
        history.recordCandidate(candidate.stationId(), candidate.stationName(), candidate.availabilityLevel().name(), candidate.predictionStatus().name(), candidate.predictionTargetAt(), candidate.requiredBikeCount());
    }

    public List<PredictionHistory> getPredictionHistories(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        // 최신 30건만 반환 강제
        return predictionHistoryRepository.findByUserIdOrderByQueriedAtDesc(userId, PageRequest.of(0, MAX_PREDICTION_HISTORIES));
    }

    public RetentionScoreSummary getPredictionScoreSummary(Long userId) {
        if (userId == null) throw new IllegalArgumentException("userId는 필수입니다.");
        Map<String, ScoreLevel> byLevel = new LinkedHashMap<>();
        long scoredCount = 0;
        long hitCount = 0;
        for (PredictionHistoryRepository.ScoreSummaryRow row : predictionHistoryRepository.summarizeScoresByUserId(userId)) {
            String level = row.getLevel();
            long scored = row.getScoredCount();
            long hits = row.getHitCount();
            byLevel.put(level, new ScoreLevel(scored, hits));
            scoredCount += scored;
            hitCount += hits;
        }
        return scoredCount == 0 ? null : new RetentionScoreSummary(scoredCount, hitCount, (double) hitCount / scoredCount, byLevel);
    }

    public record ScoreLevel(long scoredCount, long hitCount) { }
    public record RetentionScoreSummary(long scoredCount, long hitCount, double hitRate, Map<String, ScoreLevel> byLevel) { }

    @Transactional
    public void deletePredictionHistory(Long userId, Long historyId) {
        if (userId == null || historyId == null) {
            throw new IllegalArgumentException("userId와 historyId는 필수입니다.");
        }
        PredictionHistory history = predictionHistoryRepository.findByUserIdAndId(userId, historyId)
                .orElseThrow(RetentionNotFoundException::new);
        predictionHistoryRepository.delete(history);
    }

    public static class RetentionNotFoundException extends RuntimeException {
    }
}
