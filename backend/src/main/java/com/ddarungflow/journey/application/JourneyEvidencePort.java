package com.ddarungflow.journey.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface JourneyEvidencePort {
    default boolean available() { return true; }

    List<PoiEvidence> findNearby(String stationId, String theme, int limit);

    /** Stops are looked for around the rider's destination, which is not where the bike is rented. */
    List<PoiEvidence> findNearbyAt(BigDecimal latitude, BigDecimal longitude, String theme, int limit);

    Optional<RouteEvidence> bicycleRoute(
            BigDecimal originLatitude,
            BigDecimal originLongitude,
            BigDecimal destinationLatitude,
            BigDecimal destinationLongitude,
            String routeMode
    );

    EnvironmentEvidence weather(BigDecimal latitude, BigDecimal longitude, OffsetDateTime arrivalAt);

    EnvironmentEvidence airQuality(String stationId);

    static JourneyEvidencePort unavailable() {
        return new JourneyEvidencePort() {
            @Override public boolean available() { return false; }
            @Override public List<PoiEvidence> findNearby(String stationId, String theme, int limit) { return List.of(); }
            @Override public List<PoiEvidence> findNearbyAt(BigDecimal latitude, BigDecimal longitude, String theme,
                    int limit) { return List.of(); }
            @Override public Optional<RouteEvidence> bicycleRoute(BigDecimal originLatitude, BigDecimal originLongitude,
                    BigDecimal destinationLatitude, BigDecimal destinationLongitude, String routeMode) {
                return Optional.empty();
            }
            @Override public EnvironmentEvidence weather(BigDecimal latitude, BigDecimal longitude, OffsetDateTime arrivalAt) {
                return null;
            }
            @Override public EnvironmentEvidence airQuality(String stationId) { return null; }
        };
    }

    record PoiEvidence(
            String placeId,
            String name,
            String address,
            String category,
            BigDecimal latitude,
            BigDecimal longitude,
            int distanceMeters
    ) { }

    record RouteEvidence(
            int distanceMeters,
            int durationSeconds,
            String travelMode,
            String routeMode,
            List<RoutePoint> pathPoints
    ) {
        public RouteEvidence {
            pathPoints = pathPoints == null ? List.of() : List.copyOf(pathPoints);
        }
    }

    record RoutePoint(BigDecimal latitude, BigDecimal longitude) { }

    record EnvironmentEvidence(
            String source,
            String status,
            OffsetDateTime sourceTimestamp,
            Map<String, String> textFacts,
            Map<String, BigDecimal> numericFacts
    ) {
        public EnvironmentEvidence {
            textFacts = textFacts == null ? Map.of() : Map.copyOf(textFacts);
            numericFacts = numericFacts == null ? Map.of() : Map.copyOf(numericFacts);
        }
    }
}
