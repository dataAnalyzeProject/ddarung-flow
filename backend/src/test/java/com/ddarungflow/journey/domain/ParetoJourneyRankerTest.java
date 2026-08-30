package com.ddarungflow.journey.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ParetoJourneyRankerTest {
    private final ParetoJourneyRanker ranker = new ParetoJourneyRanker();

    @Test
    void excludesCandidatesWithMissingDimensionsInsteadOfTreatingNullAsZero() {
        JourneyCandidate complete = legacyCandidate("complete", "0.81", BigDecimal.ZERO, 0, 0, 0);
        JourneyCandidate missingReturn = legacyCandidate("missing-return", "0.99", null, 0, 0, 0);
        JourneyCandidate coreRental = legacyCandidate("core-rental", "0.82", null, null, null, null);

        List<JourneyCandidate> ranked = ranker.rank(List.of(missingReturn, coreRental, complete));

        assertThat(ranked).extracting(JourneyCandidate::candidateId).containsExactly("complete");
    }

    @Test
    void retainsFractionalProbabilityWhenAllLegacyDimensionsArePresent() {
        JourneyCandidate lower = legacyCandidate("lower", "0.81", BigDecimal.ZERO, 0, 0, 0);
        JourneyCandidate higher = legacyCandidate("higher", "0.82", BigDecimal.ZERO, 0, 0, 0);

        List<JourneyCandidate> ranked = ranker.rank(List.of(lower, higher));

        assertThat(ranked).extracting(JourneyCandidate::candidateId).containsExactly("higher", "lower");
    }

    private JourneyCandidate legacyCandidate(String id, String rentalProbability, BigDecimal returnProbability,
                                              Integer cyclingMinutes, Integer elevationMeters, Integer bikeLanePercent) {
        return new JourneyCandidate(id, JourneyArchetype.STABLE, 0, new BigDecimal(rentalProbability), returnProbability,
                cyclingMinutes, 100, elevationMeters, bikeLanePercent, "destination", "category", "advantage", "tradeoff");
    }
}
