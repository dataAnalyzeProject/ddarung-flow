package com.ddarungflow.journey.application;

import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.PredictionApiDtos;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;

/** Adapts Core on-demand predictions without exposing Core DTOs to Journey planning. */
@Component
public class CoreRentalPredictionAdapter implements JourneyRentalPredictionPort {
    private final MapPredictionService mapPredictionService;

    public CoreRentalPredictionAdapter(MapPredictionService mapPredictionService) {
        this.mapPredictionService = mapPredictionService;
    }

    @Override
    public List<RentalCandidate> predict(RentalPredictionRequest request) {
        return mapPredictionService.buildRouteCandidates(
                        request.originLatitude(), request.originLongitude(),
                        request.destinationLatitude(), request.destinationLongitude(),
                        "WALK", null, request.requiredBikeCount())
                .stream()
                .map(candidate -> toRentalCandidate(candidate, request.departureAt()))
                .toList();
    }

    private RentalCandidate toRentalCandidate(PredictionApiDtos.CandidatePredictionResponseDto candidate,
                                               OffsetDateTime departureAt) {
        return new RentalCandidate(
                candidate.stationId(), candidate.stationName(), candidate.latitude(), candidate.longitude(),
                candidate.availableBikeCount(), name(candidate.inventoryStatus()), candidate.inventoryCollectedAt(),
                candidate.predictionProbability(), candidate.requiredBikeCount(), name(candidate.availabilityLevel()), candidate.distanceMeters(),
                candidate.durationSeconds(), departureAt.plusSeconds(candidate.durationSeconds()), candidate.predictionTargetAt(),
                candidate.horizonMinutes(), candidate.featureAsOf(), candidate.modelVersion(), candidate.generatedAt(),
                name(candidate.predictionStatus()));
    }

    private String name(Enum<?> value) {
        return value == null ? null : value.name();
    }
}
