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
        return mapPredictionService.buildJourneyRouteCandidates(
                        request.originLatitude(), request.originLongitude(),
                        request.destinationLatitude(), request.destinationLongitude(),
                        request.departureAt(), request.requiredBikeCount())
                .stream()
                .map(this::toRentalCandidate)
                .toList();
    }

    private RentalCandidate toRentalCandidate(PredictionApiDtos.CandidatePredictionResponseDto candidate) {
        return new RentalCandidate(
                candidate.stationId(), candidate.stationName(), candidate.latitude(), candidate.longitude(),
                candidate.availableBikeCount(), name(candidate.inventoryStatus()), candidate.inventoryCollectedAt(),
                candidate.predictionProbability(), candidate.requiredBikeCount(), name(candidate.availabilityLevel()), candidate.distanceMeters(),
                candidate.durationSeconds(), candidate.arrivalAt(), candidate.predictionTargetAt(),
                candidate.horizonMinutes(), candidate.featureAsOf(), candidate.modelVersion(), candidate.generatedAt(),
                name(candidate.predictionStatus()));
    }

    private String name(Enum<?> value) {
        return value == null ? null : value.name();
    }
}
