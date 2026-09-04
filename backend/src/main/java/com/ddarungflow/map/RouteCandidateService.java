package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.repository.StationRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class RouteCandidateService {

    private static final double EARTH_RADIUS_METERS = 6371000;
    private static final int MAX_CANDIDATES = 5;

    private final StationRepository stationRepository;
    private final KakaoMapClient kakaoMapClient;

    public RouteCandidateService(StationRepository stationRepository) {
        this(stationRepository, new KakaoMapClient("https://dapi.kakao.com", ""));
    }

    @org.springframework.beans.factory.annotation.Autowired
    public RouteCandidateService(StationRepository stationRepository, KakaoMapClient kakaoMapClient) {
        this.stationRepository = stationRepository;
        this.kakaoMapClient = kakaoMapClient != null ? kakaoMapClient : new KakaoMapClient("https://dapi.kakao.com", "");
    }

    /**
     * Legacy discovery-only overload. There is no origin route evidence here, so it keeps
     * the historical straight-line values without presenting them as provider route evidence.
     */
    public List<StationDistance> findCandidates(BigDecimal destLat, BigDecimal destLng) {
        return selectDiscoveredCandidates(stationRepository.findByActiveTrue(), destLat, destLng).stream()
            .map(candidate -> {
                int distanceMeters = (int) Math.round(candidate.discoveryDistanceMeters());
                int durationSeconds = kakaoMapClient.calculateWalkDurationSeconds(candidate.discoveryDistanceMeters());
                return new StationDistance(candidate.station(), distanceMeters, durationSeconds, null, null);
            })
            .toList();
    }

    public List<StationDistance> findCandidates(
        BigDecimal originLat,
        BigDecimal originLng,
        BigDecimal destLat,
        BigDecimal destLng,
        String travelMode
    ) {
        List<DiscoveredStation> selected = selectDiscoveredCandidates(
            stationRepository.findByActiveTrue(), destLat, destLng
        );

        // R2.2: provider calls happen only after discovery has deterministically selected <= 5 candidates.
        return selected.stream()
            .map(candidate -> computeCandidateRoute(candidate.station(), originLat, originLng, travelMode))
            .toList();
    }

    /**
     * Journey planning rents at the rider's origin and rides towards the destination, so its candidates
     * are discovered around the origin. The arrival-prediction flows keep discovering around the
     * destination, which is where those riders want a bike to be available.
     */
    public List<StationDistance> findCandidatesNearOrigin(
        BigDecimal originLat,
        BigDecimal originLng,
        String travelMode
    ) {
        List<DiscoveredStation> selected = selectDiscoveredCandidates(
            stationRepository.findByActiveTrue(), originLat, originLng
        );

        return selected.stream()
            .map(candidate -> computeCandidateRoute(candidate.station(), originLat, originLng, travelMode))
            .toList();
    }

    public List<StationDistance> findCandidatesForDirect(String primaryStationId, BigDecimal originLat, BigDecimal originLng) {
        return findCandidatesForDirect(primaryStationId, originLat, originLng, null, null, "DIRECT");
    }

    public List<StationDistance> findCandidatesForDirect(
        String primaryStationId,
        BigDecimal originLat,
        BigDecimal originLng,
        BigDecimal destLat,
        BigDecimal destLng,
        String travelMode
    ) {
        List<Station> activeStations = stationRepository.findByActiveTrue();
        List<StationDistance> result = new ArrayList<>();

        // DIRECT prediction semantics are user-supplied minutesAhead. Keep its legacy distance
        // metadata isolated from the strict ROUTE/Journey provider-evidence contract.
        Station primaryStation = activeStations.stream()
            .filter(s -> s.getStationId().equals(primaryStationId))
            .findFirst()
            .orElse(null);

        if (primaryStation != null) {
            double primaryDist = calculateStationDistance(originLat, originLng, primaryStation);
            int primaryDuration = kakaoMapClient.calculateWalkDurationSeconds(primaryDist);
            result.add(new StationDistance(
                primaryStation,
                (int) Math.round(primaryDist),
                primaryDuration,
                null,
                null
            ));
        }

        BigDecimal targetLat = destLat != null ? destLat : (primaryStation != null ? primaryStation.getLatitude() : null);
        BigDecimal targetLng = destLng != null ? destLng : (primaryStation != null ? primaryStation.getLongitude() : null);

        if (targetLat != null && targetLng != null) {
            List<DiscoveredStation> alternatives = selectDiscoveredCandidates(activeStations, targetLat, targetLng);
            for (DiscoveredStation candidate : alternatives) {
                if (result.size() >= MAX_CANDIDATES) break;
                Station station = candidate.station();
                if (primaryStation != null && station.getStationId().equals(primaryStationId)) {
                    continue;
                }
                double distanceMeters = calculateStationDistance(
                    originLat, originLng, station, candidate.discoveryDistanceMeters()
                );
                int durationSeconds = kakaoMapClient.calculateWalkDurationSeconds(distanceMeters);
                result.add(new StationDistance(
                    station,
                    (int) Math.round(distanceMeters),
                    durationSeconds,
                    null,
                    null
                ));
            }
        }

        return result;
    }

    private List<DiscoveredStation> selectDiscoveredCandidates(
        List<Station> stations,
        BigDecimal centerLat,
        BigDecimal centerLng
    ) {
        List<DiscoveredStation> discovered = discoverStationsWithinRadius(stations, centerLat, centerLng, 500.0);
        if (discovered.isEmpty()) {
            discovered = discoverStationsWithinRadius(stations, centerLat, centerLng, 1000.0);
        }

        return discovered.stream()
            .sorted(Comparator
                .comparingDouble(DiscoveredStation::discoveryDistanceMeters)
                .thenComparing(candidate -> candidate.station().getStationId()))
            .limit(MAX_CANDIDATES)
            .toList();
    }

    private List<DiscoveredStation> discoverStationsWithinRadius(
        List<Station> stations,
        BigDecimal centerLat,
        BigDecimal centerLng,
        double radiusMeters
    ) {
        if (centerLat == null || centerLng == null) {
            return List.of();
        }

        List<DiscoveredStation> discovered = new ArrayList<>();
        double targetLat = centerLat.doubleValue();
        double targetLng = centerLng.doubleValue();

        for (Station station : stations) {
            double distanceToCenter = calculateDistanceMeters(
                targetLat,
                targetLng,
                station.getLatitude().doubleValue(),
                station.getLongitude().doubleValue()
            );
            if (distanceToCenter <= radiusMeters) {
                discovered.add(new DiscoveredStation(station, distanceToCenter));
            }
        }
        return discovered;
    }

    private StationDistance computeCandidateRoute(
        Station station,
        BigDecimal originLat,
        BigDecimal originLng,
        String travelMode
    ) {
        if (originLat == null || originLng == null) {
            return StationDistance.routeUnavailable(station);
        }

        try {
            Optional<MapApiDtos.RouteResultDto> route = kakaoMapClient.fetchRoute(
                originLat,
                originLng,
                station.getLatitude(),
                station.getLongitude(),
                travelMode
            );
            if (route.isPresent()) {
                return StationDistance.routeNormal(station, route.get());
            }
        } catch (Exception ignored) {
            // Per-candidate provider failure is isolated below as explicit UNAVAILABLE evidence.
        }

        // R2.2 forbids straight-line / WALK synthetic duration fallback for ROUTE/Journey prediction.
        return StationDistance.routeUnavailable(station);
    }

    private double calculateStationDistance(BigDecimal originLat, BigDecimal originLng, Station station) {
        if (originLat != null && originLng != null) {
            return calculateDistanceMeters(
                originLat.doubleValue(), originLng.doubleValue(),
                station.getLatitude().doubleValue(), station.getLongitude().doubleValue()
            );
        }
        return 0.0;
    }

    private double calculateStationDistance(
        BigDecimal originLat,
        BigDecimal originLng,
        Station station,
        double fallbackDist
    ) {
        if (originLat != null && originLng != null) {
            return calculateDistanceMeters(
                originLat.doubleValue(), originLng.doubleValue(),
                station.getLatitude().doubleValue(), station.getLongitude().doubleValue()
            );
        }
        return fallbackDist;
    }

    public static double calculateDistanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_METERS * c;
    }

    private record DiscoveredStation(Station station, double discoveryDistanceMeters) {}

    public record StationDistance(
        Station station,
        Integer distanceMeters,
        Integer durationSeconds,
        PredictionApiDtos.RouteStatus routeStatus,
        MapApiDtos.RouteResultDto routeDetail
    ) {
        public StationDistance(Station station, double distanceMeters, int durationSeconds) {
            this(station, (int) Math.round(distanceMeters), durationSeconds, null, null);
        }

        public StationDistance(Station station, double distanceMeters) {
            this(
                station,
                (int) Math.round(distanceMeters),
                (int) Math.round((distanceMeters / 80.0) * 60.0),
                null,
                null
            );
        }

        static StationDistance routeNormal(Station station, MapApiDtos.RouteResultDto routeDetail) {
            return new StationDistance(
                station,
                routeDetail.distanceMeters(),
                routeDetail.durationSeconds(),
                PredictionApiDtos.RouteStatus.NORMAL,
                routeDetail
            );
        }

        static StationDistance routeUnavailable(Station station) {
            return new StationDistance(
                station,
                null,
                null,
                PredictionApiDtos.RouteStatus.UNAVAILABLE,
                null
            );
        }
    }
}
