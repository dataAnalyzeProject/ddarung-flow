package com.ddarungflow.prediction;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Set;

public class PredictionTimeCalculator {

    private static final Set<Long> VALID_HORIZONS = Set.of(60L, 120L, 180L, 240L);

    /**
     * Calculates prediction target time, offset, horizon, and status.
     * Pure Java implementation without any Spring annotations.
     *
     * @param arrivalAt Expected arrival time at target location (OffsetDateTime)
     * @param featureAsOf The baseline feature reference time / requestedAt (OffsetDateTime)
     * @return PredictionTimeResult
     */
    public PredictionTimeResult calculate(OffsetDateTime arrivalAt, OffsetDateTime featureAsOf) {
        // 1. null과 UTC offset 일치 검사
        if (arrivalAt == null || featureAsOf == null) {
            throw new IllegalArgumentException("arrivalAt and featureAsOf must not be null");
        }
        if (!arrivalAt.getOffset().equals(featureAsOf.getOffset())) {
            throw new IllegalArgumentException("arrivalAt and featureAsOf must have matching UTC offsets");
        }

        // 2. arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS)로 predictionTargetAt을 구함
        OffsetDateTime predictionTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        // 3. arrivalAt부터 target까지 targetOffsetMinutes를 구함
        long targetOffsetMinutes = ChronoUnit.MINUTES.between(arrivalAt, predictionTargetAt);

        // 4. featureAsOf부터 target까지 horizonMinutes를 구함
        long horizonMinutes = ChronoUnit.MINUTES.between(featureAsOf, predictionTargetAt);

        // 5. target이 requestedAt(featureAsOf)보다 늦지 않으면(과거이거나 같으면) TOO_SOON
        PredictionTimeStatus status;
        if (!predictionTargetAt.isAfter(featureAsOf)) {
            status = PredictionTimeStatus.TOO_SOON;
        } else if (VALID_HORIZONS.contains(horizonMinutes)) {
            // 6. 미래 target의 horizon이 60·120·180·240이면 NORMAL
            status = PredictionTimeStatus.NORMAL;
        } else {
            // 7. 그 밖의 미래 horizon이면 UNAVAILABLE (반올림하지 않음)
            status = PredictionTimeStatus.UNAVAILABLE;
        }

        return new PredictionTimeResult(predictionTargetAt, targetOffsetMinutes, horizonMinutes, status);
    }
}
