package com.ddarungflow.airquality;

import com.ddarungflow.entity.Station;
import com.ddarungflow.repository.StationRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class AirQualityService {

    private static final ZoneOffset KST = ZoneOffset.ofHours(9);
    private static final double EARTH_RADIUS_METERS = 6_371_000.0;

    private final StationRepository stationRepository;
    private final AirKoreaClient airKoreaClient;

    public AirQualityService(StationRepository stationRepository, AirKoreaClient airKoreaClient) {
        this.stationRepository = stationRepository;
        this.airKoreaClient = airKoreaClient;
    }

    public record NearestMeasurementStation(String stationName, int distanceMeters) {
    }

    public Optional<AirQualityResponse> getAirQuality(String stationId) {
        Optional<Station> stationOpt = stationRepository.findById(stationId).filter(Station::isActive);
        if (stationOpt.isEmpty()) {
            return Optional.empty();
        }
        Station station = stationOpt.get();

        Optional<NearestMeasurementStation> nearestOpt = selectNearestMeasurementStation(
                station.getLatitude(), station.getLongitude());

        if (nearestOpt.isEmpty()) {
            return Optional.of(AirQualityResponse.unavailable(stationId, null, null, null));
        }
        NearestMeasurementStation nearest = nearestOpt.get();

        AirKoreaClient.MeasurementFetchResult fetch = airKoreaClient.fetchMeasurement(nearest.stationName());
        OffsetDateTime targetTime = OffsetDateTime.now(KST);

        AirQualityResult result = AirQualityMapper.mapFromJson(
                nearest.stationName(),
                targetTime,
                fetch.collectedAt(),
                fetch.latestJson(),
                fetch.previousJson(),
                fetch.latestFetchFailed()
        );

        return Optional.of(AirQualityResponse.from(stationId, nearest, fetch.collectedAt(), result));
    }

    public Optional<NearestMeasurementStation> selectNearestMeasurementStation(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null) {
            return Optional.empty();
        }
        List<AirKoreaClient.AirKoreaStation> catalog = airKoreaClient.fetchStationCatalog();
        if (catalog.isEmpty()) {
            return Optional.empty();
        }

        return catalog.stream()
                .filter(AirKoreaClient.AirKoreaStation::measuresAirQualityItem)
                .map(candidate -> new NearestMeasurementStation(
                        candidate.stationName(),
                        haversineMeters(latitude, longitude, candidate.latitude(), candidate.longitude())
                ))
                .min(Comparator
                        .comparingInt(NearestMeasurementStation::distanceMeters)
                        .thenComparing(NearestMeasurementStation::stationName));
    }

    private static int haversineMeters(BigDecimal lat1, BigDecimal lon1, BigDecimal lat2, BigDecimal lon2) {
        double phi1 = Math.toRadians(lat1.doubleValue());
        double phi2 = Math.toRadians(lat2.doubleValue());
        double deltaPhi = Math.toRadians(lat2.doubleValue() - lat1.doubleValue());
        double deltaLambda = Math.toRadians(lon2.doubleValue() - lon1.doubleValue());

        double a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
                + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return (int) Math.round(EARTH_RADIUS_METERS * c);
    }
}
