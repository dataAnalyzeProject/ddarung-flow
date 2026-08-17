package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.prediction.PredictionTimeCalculator;
import com.ddarungflow.prediction.PredictionTimeResult;
import com.ddarungflow.prediction.PredictionTimeStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class MapPredictionService {

    private static final BigDecimal LOW_THRESHOLD = new BigDecimal("0.24");
    private static final BigDecimal HIGH_THRESHOLD = new BigDecimal("0.36");
    private static final Duration MAX_INVENTORY_AGE = Duration.ofMinutes(10);

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
        List<RouteCandidateService.StationDistance> candidates = routeCandidateService.findCandidates(originLat, originLng, destLat, destLng, travelMode);
        // ROUTE 모드는 후보별 실제 경로 소요시간으로 도착시각을 계산한다. minutesAhead는 사용하지 않는다.
        return assembleCandidates(candidates, null, requiredBikeCount);
    }

    public List<PredictionApiDtos.CandidatePredictionResponseDto> buildDirectRoute(
        String stationId,
        BigDecimal originLat,
        BigDecimal originLng,
        String travelMode,
        Integer minutesAhead,
        Integer requiredBikeCount
    ) {
        List<RouteCandidateService.StationDistance> candidates = routeCandidateService.findCandidatesForDirect(stationId, originLat, originLng, null, null, travelMode);
        // DIRECT 모드는 사용자가 직접 입력한 도착 예정 분(minutesAhead)을 모든 후보의 도착시각으로 사용한다.
        return assembleCandidates(candidates, minutesAhead, requiredBikeCount);
    }

    private List<PredictionApiDtos.CandidatePredictionResponseDto> assembleCandidates(
        List<RouteCandidateService.StationDistance> candidates,
        Integer minutesAheadOverride,
        Integer requiredBikeCount
    ) {
        int bikeCount = (requiredBikeCount != null && requiredBikeCount >= 1 && requiredBikeCount <= 5) ? requiredBikeCount : 1;
        OffsetDateTime requestedAt = OffsetDateTime.now(clock);

        List<PredictionApiDtos.CandidatePredictionResponseDto> resultList = new ArrayList<>();

        for (RouteCandidateService.StationDistance cand : candidates) {
            Station station = cand.station();

            // 1. 후보별 실제 도착시각 계산: DIRECT 모드는 사용자 입력, ROUTE 모드는 실제 경로 소요시간
            OffsetDateTime arrivalAt = (minutesAheadOverride != null && minutesAheadOverride > 0)
                ? requestedAt.plusMinutes(minutesAheadOverride)
                : requestedAt.plusSeconds(cand.durationSeconds());

            // 저장된 배치의 featureAsOf는 정시 단위이므로, 현재 정시로 내림한 값을 근사값으로 사용해야
            // horizonMinutes가 60/120/180/240 중 하나로 맞아떨어진다. requestedAt을 그대로 쓰면
            // 분 단위 오차 때문에 거의 항상 UNAVAILABLE로 오판정된다.
            OffsetDateTime featureAsOfApprox = requestedAt.truncatedTo(ChronoUnit.HOURS);
            PredictionTimeResult timeResult = predictionTimeCalculator.calculate(requestedAt, arrivalAt, featureAsOfApprox);
            OffsetDateTime predictionTargetAt = timeResult.predictionTargetAt();

            Integer bikeAvailable = null;
            InventoryStatus invStatus = InventoryStatus.MISSING;
            OffsetDateTime inventoryCollectedAt = null;
            BigDecimal probability = null;
            PredictionApiDtos.QuantityProbabilities probabilities = null;
            PredictionApiDtos.AvailabilityLevel availabilityLevel = null;
            PredictionApiDtos.PredictionStatus predictionStatus;
            String modelVersion = null;
            OffsetDateTime generatedAt = null;
            OffsetDateTime featureAsOf = null;
            OffsetDateTime expiresAt = null;

            // 2. Candidate isolated inventory lookup
            try {
                Optional<StationInventoryCurrent> invOpt = inventoryRepository.findById(station.getStationId());
                bikeAvailable = invOpt.map(StationInventoryCurrent::getAvailableBikeCount).orElse(null);
                invStatus = invOpt.map(StationInventoryCurrent::getInventoryStatus).orElse(InventoryStatus.MISSING);
                inventoryCollectedAt = invOpt.map(StationInventoryCurrent::getCollectedAt).orElse(null);
                if (invStatus == InventoryStatus.NORMAL
                    && (inventoryCollectedAt == null
                        || Duration.between(inventoryCollectedAt, requestedAt).compareTo(MAX_INVENTORY_AGE) > 0)) {
                    invStatus = InventoryStatus.DELAYED;
                }
            } catch (Exception e) {
                invStatus = InventoryStatus.UNAVAILABLE;
            }

            if (timeResult.status() == PredictionTimeStatus.TOO_SOON) {
                // TOO_SOON이면 예측 조회를 건너뛰고 정상 확률 응답을 만들지 않는다.
                predictionStatus = PredictionApiDtos.PredictionStatus.TOO_SOON;
            } else if (timeResult.status() == PredictionTimeStatus.UNAVAILABLE) {
                predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
            } else if (invStatus != InventoryStatus.NORMAL || bikeAvailable == null) {
                predictionStatus = PredictionApiDtos.PredictionStatus.MISSING;
            } else {
                // 3. Candidate isolated on-demand model inference
                predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
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
                            .filter(row -> row.horizonMinutes() == timeResult.horizonMinutes())
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
                        predictionStatus = PredictionApiDtos.PredictionStatus.NORMAL;
                    }
                } catch (Exception e) {
                    probability = null;
                    predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
                }
            }

            int distMeters = (int) Math.round(cand.distanceMeters());
            int durationSeconds = cand.durationSeconds();

            resultList.add(new PredictionApiDtos.CandidatePredictionResponseDto(
                station.getStationId(),
                station.getName(),
                station.getLatitude(),
                station.getLongitude(),
                distMeters,
                durationSeconds,
                bikeAvailable,
                invStatus,
                inventoryCollectedAt,
                probability,
                probabilities,
                bikeCount,
                arrivalAt,
                predictionTargetAt,
                timeResult.targetOffsetMinutes(),
                timeResult.horizonMinutes(),
                featureAsOf,
                expiresAt,
                availabilityLevel,
                predictionStatus,
                modelVersion,
                generatedAt
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
