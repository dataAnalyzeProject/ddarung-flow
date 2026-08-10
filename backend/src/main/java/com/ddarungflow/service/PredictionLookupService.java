package com.ddarungflow.service;

import com.ddarungflow.dto.PredictionLookupResult;
import com.ddarungflow.entity.StationPrediction;
import com.ddarungflow.repository.StationPredictionRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class PredictionLookupService {

    private static final Set<Integer> SUPPORTED_HORIZONS = Set.of(60, 120, 180, 240);

    private final StationPredictionRepository stationPredictionRepository;

    public PredictionLookupService(StationPredictionRepository stationPredictionRepository) {
        this.stationPredictionRepository = stationPredictionRepository;
    }

    public Optional<PredictionLookupResult> findLatestValid(
        String stationId,
        OffsetDateTime predictionTargetAt,
        int horizonMinutes,
        int requiredBikeCount,
        OffsetDateTime requestedAt
    ) {
        if (!SUPPORTED_HORIZONS.contains(horizonMinutes)) {
            return Optional.empty();
        }

        if (requiredBikeCount < 1 || requiredBikeCount > 5) {
            return Optional.empty();
        }

        List<StationPrediction> candidates = stationPredictionRepository.findLatestValidCandidates(
            stationId,
            predictionTargetAt,
            horizonMinutes,
            requestedAt
        );

        if (candidates.isEmpty()) {
            return Optional.empty();
        }

        StationPrediction prediction = candidates.get(0);
        BigDecimal selectedProbability = selectProbability(prediction, requiredBikeCount);

        return Optional.of(new PredictionLookupResult(
            prediction.getBatch().getBatchId(),
            prediction.getStationId(),
            prediction.getPredictionTargetAt(),
            prediction.getHorizonMinutes(),
            requiredBikeCount,
            selectedProbability,
            prediction.getBatch().getFeatureAsOf(),
            prediction.getBatch().getExpiresAt()
        ));
    }

    private BigDecimal selectProbability(StationPrediction prediction, int requiredBikeCount) {
        return switch (requiredBikeCount) {
            case 1 -> prediction.getAtLeast1Probability();
            case 2 -> prediction.getAtLeast2Probability();
            case 3 -> prediction.getAtLeast3Probability();
            case 4 -> prediction.getAtLeast4Probability();
            case 5 -> prediction.getAtLeast5Probability();
            default -> throw new IllegalArgumentException("Unsupported bike count: " + requiredBikeCount);
        };
    }
}
