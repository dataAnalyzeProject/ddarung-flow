package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.inventory.CurrentInventoryEligibility;
import com.ddarungflow.prediction.PredictionTimeCalculator;
import com.ddarungflow.prediction.PredictionTimeResult;
import com.ddarungflow.prediction.PredictionTimeStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class MapPredictionService {

    private static final BigDecimal LOW_THRESHOLD = new BigDecimal("0.40");
    private static final BigDecimal HIGH_THRESHOLD = new BigDecimal("0.70");

    private final RouteCandidateService routeCandidateService;
    private final StationInventoryCurrentRepository inventoryRepository;
    private final InferenceClient inferenceClient;
    private final PredictionTimeCalculator predictionTimeCalculator;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public MapPredictionService(
        RouteCandidateService routeCandidateService,
        StationInventoryCurrentRepository inventoryRepository,
        InferenceClient inferenceClient
    ) {
        this(routeCandidateService, inventoryRepository, inferenceClient, Clock.systemDefaultZone());
    }

    public MapPredictionService(
        RouteCandidateService routeCandidateService,
        StationInventoryCurrentRepository inventoryRepository,
        InferenceClient inferenceClient,
        Clock clock
    ) {
        this.routeCandidateService = routeCandidateService;
        this.inventoryRepository = inventoryRepository;
        this.inferenceClient = inferenceClient;
        this.predictionTimeCalculator = new PredictionTimeCalculator();
        this.clock = clock;
    }

    public List<PredictionApiDtos.CandidatePredictionResponseDto> buildRouteCandidates(
        BigDecimal originLat,
        BigDecimal originLng,
        BigDecimal destLat,
        BigDecimal destLng,
        String travelMode,
        Integer minutesAhead,
        Integer requiredBikeCount
    ) {
        List<RouteCandidateService.StationDistance> candidates = routeCandidateService.findCandidates(
            originLat, originLng, destLat, destLng, travelMode
        );
        return assembleCandidates(candidates, null, requiredBikeCount, null, true);
    }

    /**
     * Internal Journey boundary: Core still uses the actual request time for features,
     * while the Journey's selected departure determines candidate arrival time.
     */
    public List<PredictionApiDtos.CandidatePredictionResponseDto> buildJourneyRouteCandidates(
        BigDecimal originLat,
        BigDecimal originLng,
        BigDecimal destLat,
        BigDecimal destLng,
        OffsetDateTime departureAt,
        Integer requiredBikeCount
    ) {
        List<RouteCandidateService.StationDistance> candidates = routeCandidateService.findCandidates(
            originLat, originLng, destLat, destLng, "WALK"
        );
        return assembleCandidates(candidates, null, requiredBikeCount, departureAt, true);
    }

    public List<PredictionApiDtos.CandidatePredictionResponseDto> buildDirectRoute(
        String stationId,
        BigDecimal originLat,
        BigDecimal originLng,
        String travelMode,
        Integer minutesAhead,
        Integer requiredBikeCount
    ) {
        List<RouteCandidateService.StationDistance> candidates = routeCandidateService.findCandidatesForDirect(
            stationId, originLat, originLng, null, null, travelMode
        );
        // DIRECT keeps the existing user-supplied minutesAhead semantics and does not require route evidence.
        return assembleCandidates(candidates, minutesAhead, requiredBikeCount, null, false);
    }

    private List<PredictionApiDtos.CandidatePredictionResponseDto> assembleCandidates(
        List<RouteCandidateService.StationDistance> candidates,
        Integer minutesAheadOverride,
        Integer requiredBikeCount,
        OffsetDateTime journeyDepartureAt,
        boolean routeEvidenceRequired
    ) {
        int bikeCount = (requiredBikeCount != null && requiredBikeCount >= 1 && requiredBikeCount <= 5)
            ? requiredBikeCount
            : 1;
        OffsetDateTime requestedAt = OffsetDateTime.now(clock);
        OffsetDateTime featureAsOfApprox = requestedAt.truncatedTo(ChronoUnit.HOURS);

        List<PredictionApiDtos.CandidatePredictionResponseDto> resultList = new ArrayList<>();

        for (RouteCandidateService.StationDistance cand : candidates) {
            Station station = cand.station();

            PredictionApiDtos.RouteStatus routeStatus = null;
            MapApiDtos.RouteResultDto routeDetail = null;
            boolean routeAvailable = true;

            if (routeEvidenceRequired) {
                if (cand.routeStatus() == PredictionApiDtos.RouteStatus.NORMAL && cand.routeDetail() != null) {
                    routeStatus = PredictionApiDtos.RouteStatus.NORMAL;
                    routeDetail = cand.routeDetail();
                } else {
                    routeStatus = PredictionApiDtos.RouteStatus.UNAVAILABLE;
                    routeAvailable = false;
                }
            }

            OffsetDateTime arrivalAt = null;
            PredictionTimeResult timeResult = null;
            if (routeAvailable) {
                OffsetDateTime arrivalBase = journeyDepartureAt == null ? requestedAt : journeyDepartureAt;
                if (minutesAheadOverride != null && minutesAheadOverride > 0) {
                    arrivalAt = requestedAt.plusMinutes(minutesAheadOverride);
                } else {
                    Integer durationSeconds = routeEvidenceRequired
                        ? routeDetail.durationSeconds()
                        : cand.durationSeconds();
                    if (durationSeconds != null) {
                        arrivalAt = arrivalBase.plusSeconds(durationSeconds);
                    }
                }
                if (arrivalAt != null) {
                    timeResult = predictionTimeCalculator.calculate(requestedAt, arrivalAt, featureAsOfApprox);
                }
            }

            OffsetDateTime predictionTargetAt = timeResult != null ? timeResult.predictionTargetAt() : null;

            Integer bikeAvailable = null;
            InventoryStatus invStatus = InventoryStatus.MISSING;
            OffsetDateTime inventoryCollectedAt = null;
            BigDecimal probability = null;
            PredictionApiDtos.QuantityProbabilities probabilities = null;
            PredictionApiDtos.AvailabilityLevel availabilityLevel = null;
            List<PredictionApiDtos.HorizonOutlook> horizonOutlook = null;
            PredictionApiDtos.PredictionStatus predictionStatus;
            String modelVersion = null;
            OffsetDateTime generatedAt = null;
            OffsetDateTime featureAsOf = null;
            OffsetDateTime expiresAt = null;

            try {
                Optional<StationInventoryCurrent> invOpt = inventoryRepository.findById(station.getStationId());
                bikeAvailable = invOpt.map(StationInventoryCurrent::getAvailableBikeCount).orElse(null);
                invStatus = invOpt.map(StationInventoryCurrent::getInventoryStatus).orElse(InventoryStatus.MISSING);
                inventoryCollectedAt = invOpt.map(StationInventoryCurrent::getCollectedAt).orElse(null);
                invStatus = CurrentInventoryEligibility.status(invStatus, inventoryCollectedAt, requestedAt);
            } catch (Exception e) {
                invStatus = InventoryStatus.UNAVAILABLE;
            }

            if (!routeAvailable || timeResult == null) {
                // No actual route duration -> no future arrival horizon -> no inference.
                predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
            } else if (timeResult.status() == PredictionTimeStatus.TOO_SOON) {
                predictionStatus = PredictionApiDtos.PredictionStatus.TOO_SOON;
            } else if (timeResult.status() == PredictionTimeStatus.UNAVAILABLE) {
                predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
            } else if (invStatus != InventoryStatus.NORMAL || bikeAvailable == null) {
                predictionStatus = PredictionApiDtos.PredictionStatus.MISSING;
            } else {
                predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
                long selectedHorizonMinutes = timeResult.horizonMinutes();
                try {
                    InferenceDtos.PredictResponse response = inferenceClient.predict(List.of(
                        new InferenceDtos.CandidateRequest(
                            station.getStationId(),
                            station.getStationNumber(),
                            bikeAvailable,
                            featureAsOfApprox
                        )
                    ));
                    InferenceDtos.CandidatePrediction prediction = response.predictions().stream()
                        .filter(item -> station.getStationId().equals(item.stationId()))
                        .findFirst()
                        .orElseThrow();
                    if ("MISSING".equals(prediction.status())) {
                        predictionStatus = PredictionApiDtos.PredictionStatus.MISSING;
                    } else if ("NORMAL".equals(prediction.status())) {
                        List<InferenceDtos.ProbabilityRow> horizonRows = prediction.rows().stream()
                            .filter(row -> row.horizonMinutes() == selectedHorizonMinutes)
                            .sorted(Comparator.comparingInt(InferenceDtos.ProbabilityRow::requiredBikeCount))
                            .toList();
                        if (horizonRows.size() != 5) {
                            throw new IllegalStateException("inference response must contain five quantity rows");
                        }
                        probability = horizonRows.get(bikeCount - 1).probability();
                        modelVersion = response.modelVersion();
                        generatedAt = response.generatedAt();
                        featureAsOf = featureAsOfApprox;
                        probabilities = new PredictionApiDtos.QuantityProbabilities(
                            horizonRows.get(0).probability(),
                            horizonRows.get(1).probability(),
                            horizonRows.get(2).probability(),
                            horizonRows.get(3).probability(),
                            horizonRows.get(4).probability()
                        );
                        availabilityLevel = toAvailabilityLevel(probability);
                        horizonOutlook = prediction.rows().stream()
                            .filter(row -> row.requiredBikeCount() == bikeCount)
                            .sorted(Comparator.comparingInt(InferenceDtos.ProbabilityRow::horizonMinutes))
                            .map(row -> new PredictionApiDtos.HorizonOutlook(
                                row.horizonMinutes(),
                                featureAsOfApprox.plusMinutes(row.horizonMinutes()),
                                row.probability(),
                                toAvailabilityLevel(row.probability()),
                                row.horizonMinutes() == selectedHorizonMinutes
                            ))
                            .toList();
                        predictionStatus = PredictionApiDtos.PredictionStatus.NORMAL;
                    }
                } catch (Exception e) {
                    probability = null;
                    probabilities = null;
                    horizonOutlook = null;
                    availabilityLevel = null;
                    modelVersion = null;
                    generatedAt = null;
                    featureAsOf = null;
                    predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
                }
            }

            Integer distanceMeters;
            Integer durationSeconds;
            if (routeEvidenceRequired) {
                // Legacy flat fields are populated only from the same provider route evidence.
                distanceMeters = routeDetail != null ? routeDetail.distanceMeters() : null;
                durationSeconds = routeDetail != null ? routeDetail.durationSeconds() : null;
            } else {
                distanceMeters = cand.distanceMeters();
                durationSeconds = cand.durationSeconds();
            }

            long targetOffsetMinutes = timeResult != null ? timeResult.targetOffsetMinutes() : 0L;
            long horizonMinutes = timeResult != null ? timeResult.horizonMinutes() : 0L;

            resultList.add(new PredictionApiDtos.CandidatePredictionResponseDto(
                station.getStationId(),
                station.getName(),
                station.getLatitude(),
                station.getLongitude(),
                distanceMeters,
                durationSeconds,
                bikeAvailable,
                invStatus,
                inventoryCollectedAt,
                probability,
                probabilities,
                bikeCount,
                arrivalAt,
                predictionTargetAt,
                targetOffsetMinutes,
                horizonMinutes,
                featureAsOf,
                expiresAt,
                availabilityLevel,
                predictionStatus,
                modelVersion,
                generatedAt,
                horizonOutlook,
                routeStatus,
                routeDetail
            ));
        }

        return resultList;
    }

    static PredictionApiDtos.AvailabilityLevel toAvailabilityLevel(BigDecimal probability) {
        if (probability == null || probability.compareTo(BigDecimal.ZERO) < 0 || probability.compareTo(BigDecimal.ONE) > 0) {
            return null;
        }
        if (probability.compareTo(HIGH_THRESHOLD) >= 0) {
            return PredictionApiDtos.AvailabilityLevel.HIGH;
        }
        if (probability.compareTo(LOW_THRESHOLD) >= 0) {
            return PredictionApiDtos.AvailabilityLevel.MEDIUM;
        }
        return PredictionApiDtos.AvailabilityLevel.LOW;
    }
}
