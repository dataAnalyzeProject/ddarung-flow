package com.ddarungflow.journey.domain;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;

public class ParetoJourneyRanker {
    public List<JourneyCandidate> rank(List<JourneyCandidate> candidates) {
        List<JourneyCandidate> ranked = candidates.stream()
                .filter(this::isFullyScorable)
                .sorted(Comparator.comparing(this::score).reversed())
                .limit(3)
                .toList();
        return IntStream.range(0, ranked.size())
                .mapToObj(index -> {
                    JourneyCandidate candidate = ranked.get(index);
                    return new JourneyCandidate(candidate.candidateId(), candidate.archetype(), index + 1,
                            candidate.rentalProbability(), candidate.returnProbability(), candidate.cyclingMinutes(), candidate.distanceMeters(),
                            candidate.elevationMeters(), candidate.bikeLanePercent(), candidate.destinationName(), candidate.destinationCategory(),
                            candidate.advantage(), candidate.tradeoff(), candidate.stationId(), candidate.stationName(), candidate.latitude(),
                            candidate.longitude(), candidate.requiredBikeCount(), candidate.availableBikeCount(), candidate.inventoryStatus(),
                            candidate.inventoryCollectedAt(), candidate.availabilityLevel(), candidate.accessDurationSeconds(), candidate.arrivalAt(),
                            candidate.predictionTargetAt(), candidate.horizonMinutes(), candidate.featureAsOf(), candidate.modelVersion(),
                            candidate.generatedAt(), candidate.predictionStatus());
                })
                .toList();
    }

    private boolean isFullyScorable(JourneyCandidate candidate) {
        return candidate.rentalProbability() != null && candidate.returnProbability() != null
                && candidate.bikeLanePercent() != null && candidate.elevationMeters() != null && candidate.cyclingMinutes() != null;
    }

    private BigDecimal score(JourneyCandidate candidate) {
        return candidate.rentalProbability().add(candidate.returnProbability())
                .add(BigDecimal.valueOf(candidate.bikeLanePercent()))
                .subtract(BigDecimal.valueOf(candidate.elevationMeters()))
                .subtract(BigDecimal.valueOf(candidate.cyclingMinutes()));
    }
}
