package com.ddarungflow.map;

import com.ddarungflow.dto.PredictionLookupResult;
import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.service.PredictionLookupService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class MapPredictionService {

    private static final BigDecimal LOW_THRESHOLD = new BigDecimal("0.24");
    private static final BigDecimal HIGH_THRESHOLD = new BigDecimal("0.36");

    private final RouteCandidateService routeCandidateService;
    private final StationInventoryCurrentRepository inventoryRepository;
    private final PredictionLookupService predictionLookupService;

    public MapPredictionService(
        RouteCandidateService routeCandidateService,
        StationInventoryCurrentRepository inventoryRepository,
        PredictionLookupService predictionLookupService
    ) {
        this.routeCandidateService = routeCandidateService;
        this.inventoryRepository = inventoryRepository;
        this.predictionLookupService = predictionLookupService;
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
        return assembleCandidates(candidates, minutesAhead, requiredBikeCount);
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
        return assembleCandidates(candidates, minutesAhead, requiredBikeCount);
    }

    private List<PredictionApiDtos.CandidatePredictionResponseDto> assembleCandidates(
        List<RouteCandidateService.StationDistance> candidates,
        Integer minutesAhead,
        Integer requiredBikeCount
    ) {
        int horizon = (minutesAhead != null && minutesAhead > 0) ? minutesAhead : 60;
        int bikeCount = (requiredBikeCount != null && requiredBikeCount >= 1 && requiredBikeCount <= 5) ? requiredBikeCount : 1;
        OffsetDateTime requestedAt = OffsetDateTime.now();
        OffsetDateTime predictionTargetAt = requestedAt.plusMinutes(horizon);

        List<PredictionApiDtos.CandidatePredictionResponseDto> resultList = new ArrayList<>();

        for (RouteCandidateService.StationDistance cand : candidates) {
            Station station = cand.station();
            Integer bikeAvailable = null;
            InventoryStatus invStatus = InventoryStatus.MISSING;
            BigDecimal probability = null;
            PredictionApiDtos.AvailabilityLevel availabilityLevel = null;
            PredictionApiDtos.PredictionStatus predictionStatus = PredictionApiDtos.PredictionStatus.MISSING;
            String modelVersion = null;
            OffsetDateTime generatedAt = null;

            // 1. Candidate isolated inventory lookup
            try {
                Optional<StationInventoryCurrent> invOpt = inventoryRepository.findById(station.getStationId());
                bikeAvailable = invOpt.map(StationInventoryCurrent::getAvailableBikeCount).orElse(null);
                invStatus = invOpt.map(StationInventoryCurrent::getInventoryStatus).orElse(InventoryStatus.MISSING);
            } catch (Exception e) {
                invStatus = InventoryStatus.UNAVAILABLE;
            }

            // 2. Candidate isolated ML prediction lookup
            try {
                Optional<PredictionLookupResult> predOpt = predictionLookupService.findLatestValid(
                    station.getStationId(),
                    predictionTargetAt,
                    horizon,
                    bikeCount,
                    requestedAt
                );
                Optional<PredictionLookupResult> validPrediction = predOpt;
                if (validPrediction.isPresent()) {
                    PredictionLookupResult prediction = validPrediction.get();
                    probability = prediction.selectedProbability();
                    modelVersion = prediction.modelVersion();
                    generatedAt = prediction.generatedAt();
                    availabilityLevel = toAvailabilityLevel(probability);
                    predictionStatus = PredictionApiDtos.PredictionStatus.NORMAL;
                }
            } catch (Exception e) {
                probability = null;
                predictionStatus = PredictionApiDtos.PredictionStatus.UNAVAILABLE;
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
                probability,
                predictionTargetAt,
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
