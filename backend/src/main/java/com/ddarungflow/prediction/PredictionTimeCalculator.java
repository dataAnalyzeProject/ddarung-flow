package com.ddarungflow.prediction;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Set;

public class PredictionTimeCalculator {

    private static final Set<Long> VALID_HORIZONS = Set.of(60L, 120L, 180L, 240L);

    /**
     * Calculates prediction target time, offset, horizon, and status.
     * Pure Java implementation without any Spring annotations.
     *
     * @param arrivalAt Expected arrival time at target location
     * @param featureAsOf The baseline feature reference time (request time)
     * @return PredictionTimeResult
     */
    public PredictionTimeResult calculate(LocalDateTime arrivalAt, LocalDateTime featureAsOf) {
        if (arrivalAt == null || featureAsOf == null) {
            throw new IllegalArgumentException("arrivalAt and featureAsOf must not be null");
        }

        // floorToHour(arrivalAt + 30분)
        LocalDateTime predictionTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        long targetOffsetMinutes = ChronoUnit.MINUTES.between(featureAsOf, predictionTargetAt);
        long horizonMinutes = ChronoUnit.MINUTES.between(featureAsOf, predictionTargetAt);

        PredictionTimeStatus status;
        if (!predictionTargetAt.isAfter(featureAsOf)) {
            status = PredictionTimeStatus.TOO_SOON;
        } else if (VALID_HORIZONS.contains(horizonMinutes)) {
            status = PredictionTimeStatus.NORMAL;
        } else {
            status = PredictionTimeStatus.UNAVAILABLE;
        }

        return new PredictionTimeResult(predictionTargetAt, targetOffsetMinutes, horizonMinutes, status);
    }
}
