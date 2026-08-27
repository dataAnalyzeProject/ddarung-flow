package com.ddarungflow.dto;

import java.time.OffsetDateTime;

public final class PredictionReliabilityDtos {
    private PredictionReliabilityDtos() { }

    public record Response(
            String modelVersion,
            OffsetDateTime evaluatedAt,
            Combination combination,
            Band band,
            String reliabilityLevel,
            String disclosure
    ) { }

    public record Combination(int horizonMinutes, int requiredBikeCount, int sampleCount) { }

    public record Band(
            int lowerPercent,
            int upperPercent,
            int sampleCount,
            Double meanPredicted,
            Double accuracyRate,
            Double calibrationErrorPercent
    ) { }

    public record ErrorResponse(String code, String message) { }
}
