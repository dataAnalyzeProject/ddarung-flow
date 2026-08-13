package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.repository.StationRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class RouteCandidateService {

    private static final double EARTH_RADIUS_METERS = 6371000;

    private final StationRepository stationRepository;
    private final KakaoMapClient kakaoMapClient;

    @org.springframework.beans.factory.annotation.Autowired
    public RouteCandidateService(StationRepository stationRepository) {
        this(stationRepository, new KakaoMapClient("https://dapi.kakao.com", "fake-key"));
    }

    public RouteCandidateService(StationRepository stationRepository, KakaoMapClient kakaoMapClient) {
        this.stationRepository = stationRepository;
        this.kakaoMapClient = kakaoMapClient != null ? kakaoMapClient : new KakaoMapClient("https://dapi.kakao.com", "fake-key");
    }

    public List<StationDistance> findCandidates(BigDecimal destLat, BigDecimal destLng) {
        return findCandidates(null, null, destLat, destLng, "WALK");
    }

    public List<StationDistance> findCandidates(BigDecimal originLat, BigDecimal originLng, BigDecimal destLat, BigDecimal destLng, String travelMode) {
        List<Station> activeStations = stationRepository.findByActiveTrue();

        // 1. Search candidates within 500m radius of destination
        List<StationDistance> candidates = getStationsWithinRadius(activeStations, originLat, originLng, destLat, destLng, travelMode, 500.0);

        // 2. If 0 candidates, expand radius to 1km (1000m)
        if (candidates.isEmpty()) {
            candidates = getStationsWithinRadius(activeStations, originLat, originLng, destLat, destLng, travelMode, 1000.0);
        }

        // 3. Sort by distance ascending and select up to top 5
        candidates.sort(Comparator.comparingDouble(StationDistance::distanceMeters));
        return candidates.stream().limit(5).toList();
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

        // 1. Primary specified station MUST be #1 if exists
        Station primaryStation = activeStations.stream()
            .filter(s -> s.getStationId().equals(primaryStationId))
            .findFirst()
            .orElse(null);

        if (primaryStation != null) {
            double primaryDist = calculateStationDistance(originLat, originLng, primaryStation);
            int primaryDuration = kakaoMapClient.calculateWalkDurationSeconds(primaryDist);
            result.add(new StationDistance(primaryStation, primaryDist, primaryDuration));
        }

        // 2. Search alternative candidates around destination or primary station
        BigDecimal targetLat = destLat != null ? destLat : (primaryStation != null ? primaryStation.getLatitude() : null);
        BigDecimal targetLng = destLng != null ? destLng : (primaryStation != null ? primaryStation.getLongitude() : null);

        if (targetLat != null && targetLng != null) {
            List<StationDistance> alternatives = findCandidates(originLat, originLng, targetLat, targetLng, travelMode);
            for (StationDistance alt : alternatives) {
                if (result.size() >= 5) break;
                if (primaryStation != null && alt.station().getStationId().equals(primaryStationId)) {
                    continue; // Remove duplicate of primary station
                }
                result.add(alt);
            }
        }

        return result;
    }

    private List<StationDistance> getStationsWithinRadius(
        List<Station> stations,
        BigDecimal originLat,
        BigDecimal originLng,
        BigDecimal destLat,
        BigDecimal destLng,
        String travelMode,
        double radiusMeters
    ) {
        List<StationDistance> list = new ArrayList<>();
        double targetLat = destLat.doubleValue();
        double targetLng = destLng.doubleValue();

        for (Station s : stations) {
            double distToDest = calculateDistanceMeters(
                targetLat, targetLng,
                s.getLatitude().doubleValue(), s.getLongitude().doubleValue()
            );
            if (distToDest <= radiusMeters) {
                StationDistance sd = computeCandidateRoute(s, originLat, originLng, travelMode, distToDest);
                list.add(sd);
            }
        }
        return list;
    }

    private StationDistance computeCandidateRoute(
        Station station,
        BigDecimal originLat,
        BigDecimal originLng,
        String travelMode,
        double fallbackDist
    ) {
        if (originLat != null && originLng != null) {
            try {
                java.util.Optional<MapApiDtos.RouteResultDto> routeOpt = kakaoMapClient.fetchRoute(
                    originLat, originLng,
                    station.getLatitude(), station.getLongitude(),
                    travelMode
                );
                if (routeOpt.isPresent()) {
                    MapApiDtos.RouteResultDto r = routeOpt.get();
                    return new StationDistance(station, r.distanceMeters(), r.durationSeconds());
                }
            } catch (Exception e) {
                // Provider failure for one candidate falls back without failing other candidates
            }
        }

        double totalDist = calculateStationDistance(originLat, originLng, station, fallbackDist);
        int durationSeconds = kakaoMapClient.calculateWalkDurationSeconds(totalDist);
        return new StationDistance(station, totalDist, durationSeconds);
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

    private double calculateStationDistance(BigDecimal originLat, BigDecimal originLng, Station station, double fallbackDist) {
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

    public record StationDistance(Station station, double distanceMeters, int durationSeconds) {
        public StationDistance(Station station, double distanceMeters) {
            this(station, distanceMeters, (int) Math.round((distanceMeters / 80.0) * 60.0));
        }
    }
}
