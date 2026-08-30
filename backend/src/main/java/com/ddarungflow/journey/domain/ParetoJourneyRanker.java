package com.ddarungflow.journey.domain;

import java.util.Comparator;
import java.util.List;
import java.math.BigDecimal;

public class ParetoJourneyRanker {
    public List<JourneyCandidate> rank(List<JourneyCandidate> candidates) {
        return candidates.stream()
                .sorted(Comparator.comparingInt(this::score).reversed())
                .limit(3)
                .map(candidate -> new JourneyCandidate(candidate.candidateId(), candidate.archetype(),
                        candidates.stream().sorted(Comparator.comparingInt(this::score).reversed()).toList().indexOf(candidate) + 1,
                        candidate.rentalProbability(), candidate.returnProbability(), candidate.cyclingMinutes(), candidate.distanceMeters(),
                        candidate.elevationMeters(), candidate.bikeLanePercent(), candidate.destinationName(), candidate.destinationCategory(),
                        candidate.advantage(), candidate.tradeoff(), candidate.stationId(), candidate.stationName(), candidate.latitude(),
                        candidate.longitude(), candidate.requiredBikeCount(), candidate.availableBikeCount(), candidate.inventoryStatus(),
                        candidate.inventoryCollectedAt(), candidate.availabilityLevel(), candidate.accessDurationSeconds(), candidate.arrivalAt(),
                        candidate.predictionTargetAt(), candidate.horizonMinutes(), candidate.featureAsOf(), candidate.modelVersion(),
                        candidate.generatedAt(), candidate.predictionStatus()))
                .toList();
    }

    private int score(JourneyCandidate candidate) {
        return value(candidate.rentalProbability()) + value(candidate.returnProbability()) + value(candidate.bikeLanePercent())
                - value(candidate.elevationMeters()) - value(candidate.cyclingMinutes());
    }

    private int value(BigDecimal value) { return value == null ? 0 : value.intValue(); }
    private int value(Integer value) { return value == null ? 0 : value; }
}
