package com.ddarungflow.service;

import com.ddarungflow.dto.PredictionTimeResult;
import com.ddarungflow.dto.PredictionTimeResult.PredictionStatus;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Set;

@Service
public class PredictionTimeService {

    private static final Set<Long> VALID_HORIZONS = Set.of(60L, 120L, 180L, 240L);

    /**
     * Calculates prediction target time, offset, horizon, and status.
     *
     * @param arrivalAt Expected arrival time at target location
     * @param featureAsOf The baseline feature reference time (or request time)
     * @return PredictionTimeResult
     */
    public PredictionTimeResult calculate(LocalDateTime arrivalAt, LocalDateTime featureAsOf) {
        if (arrivalAt == null || featureAsOf == null) {
            throw new IllegalArgumentException("arrivalAt and featureAsOf must not be null");
        }

        // floorToHour(arrivalAt + 30분)
        // e.g. arrivalAt = 10:00 -> +30m = 10:30 -> floored to hour = 10:00
        // arrivalAt = 10:30 -> +30m = 11:00 -> floored to hour = 11:00
        LocalDateTime predictionTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        long targetOffsetMinutes = ChronoUnit.MINUTES.between(featureAsOf, predictionTargetAt);
        long horizonMinutes = ChronoUnit.MINUTES.between(featureAsOf, predictionTargetAt);

        PredictionStatus status;
        if (!predictionTargetAt.isAfter(featureAsOf)) {
            status = PredictionStatus.TOO_SOON;
        } else if (VALID_HORIZONS.contains(horizonMinutes)) {
            status = PredictionStatus.NORMAL;
        } else {
            status = PredictionStatus.UNAVAILABLE;
        }

        return new PredictionTimeResult(predictionTargetAt, targetOffsetMinutes, horizonMinutes, status);
    }
}
