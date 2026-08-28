package com.ddarungflow.journey.domain;

import java.util.Comparator;
import java.util.List;

public class ParetoJourneyRanker {
    public List<JourneyCandidate> rank(List<JourneyCandidate> candidates) {
        return candidates.stream()
                .sorted(Comparator.comparingInt(this::score).reversed())
                .limit(3)
                .map(candidate -> new JourneyCandidate(candidate.candidateId(), candidate.archetype(),
                        candidates.stream().sorted(Comparator.comparingInt(this::score).reversed()).toList().indexOf(candidate) + 1,
                        candidate.rentalProbability(), candidate.returnProbability(), candidate.cyclingMinutes(), candidate.distanceMeters(),
                        candidate.elevationMeters(), candidate.bikeLanePercent(), candidate.destinationName(), candidate.destinationCategory(),
                        candidate.advantage(), candidate.tradeoff()))
                .toList();
    }

    private int score(JourneyCandidate candidate) {
        return candidate.rentalProbability() + candidate.returnProbability() + candidate.bikeLanePercent()
                - candidate.elevationMeters() - candidate.cyclingMinutes();
    }
}
