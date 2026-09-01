package com.ddarungflow.inference;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public final class InferenceDtos {
    private InferenceDtos() {}

    public record CandidateRequest(
        String stationId,
        String stationNumber,
        Integer currentBikeCount,
        OffsetDateTime featureAsOf
    ) {}

    public record PredictRequest(List<CandidateRequest> candidates) {}

    public record ProbabilityRow(
        int horizonMinutes,
        int requiredBikeCount,
        BigDecimal probability
    ) {}

    public record CandidatePrediction(
        String stationId,
        String status,
        List<ProbabilityRow> rows
    ) {}

    public record PredictResponse(
        String status,
        String errorCode,
        String modelVersion,
        OffsetDateTime generatedAt,
        List<CandidatePrediction> predictions
    ) {}

    public record RuntimeModelResponse(
        String status,
        String modelVersion,
        String artifactSha256,
        String modelSource,
        OffsetDateTime loadedAt,
        List<Integer> supportedHorizons,
        List<Integer> supportedQuantities
    ) {}
}
