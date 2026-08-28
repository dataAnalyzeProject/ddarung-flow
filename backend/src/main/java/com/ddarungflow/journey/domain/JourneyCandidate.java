package com.ddarungflow.journey.domain;

public record JourneyCandidate(String candidateId, JourneyArchetype archetype, int rank,
                               int rentalProbability, int returnProbability,
                               int cyclingMinutes, int distanceMeters,
                               int elevationMeters, int bikeLanePercent,
                               String destinationName, String destinationCategory,
                               String advantage, String tradeoff) { }
