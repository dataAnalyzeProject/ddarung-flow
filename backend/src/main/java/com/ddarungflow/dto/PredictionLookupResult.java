package com.ddarungflow.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PredictionLookupResult(
    UUID batchId,
    String stationId,
    OffsetDateTime predictionTargetAt,
    int horizonMinutes,
    int requiredBikeCount,
    BigDecimal selectedProbability,
    OffsetDateTime featureAsOf,
    OffsetDateTime expiresAt
) {}
