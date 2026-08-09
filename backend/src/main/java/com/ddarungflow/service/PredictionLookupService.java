package com.ddarungflow.service;

import com.ddarungflow.dto.PredictionLookupResult;
import com.ddarungflow.repository.StationPredictionRepository;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Optional;

@Service
public class PredictionLookupService {

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
        throw new UnsupportedOperationException("TODO(BE-3.2): implement the approved lookup contract");
    }
}
