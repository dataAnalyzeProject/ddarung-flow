package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public record ConsumerAiEvidenceBundle(
        Map<String, Evidence> rentalCandidates,
        Map<String, Evidence> pois,
        Map<String, Evidence> routes,
        Map<String, Evidence> weather,
        Map<String, Evidence> airQuality
) {
    public ConsumerAiEvidenceBundle {
        rentalCandidates = copyEvidenceMap(rentalCandidates, "rentalCandidates");
        pois = copyEvidenceMap(pois, "pois");
        routes = copyEvidenceMap(routes, "routes");
        weather = copyEvidenceMap(weather, "weather");
        airQuality = copyEvidenceMap(airQuality, "airQuality");
    }

    public Evidence find(EvidenceType type, String evidenceId) {
        if (type == null || evidenceId == null) return null;
        return switch (type) {
            case RENTAL_CANDIDATE -> rentalCandidates.get(evidenceId);
            case POI -> pois.get(evidenceId);
            case ROUTE -> routes.get(evidenceId);
            case WEATHER -> weather.get(evidenceId);
            case AIR_QUALITY -> airQuality.get(evidenceId);
        };
    }

    private static Map<String, Evidence> copyEvidenceMap(Map<String, Evidence> evidence, String field) {
        if (evidence == null) return Map.of();
        Map<String, Evidence> copy = new LinkedHashMap<>();
        evidence.forEach((id, value) -> {
            if (id == null || id.isBlank() || value == null || !id.equals(value.evidenceId())) {
                throw new IllegalArgumentException(field + " must contain non-blank keys matching evidence IDs");
            }
            copy.put(id, value);
        });
        return Collections.unmodifiableMap(copy);
    }

    public enum EvidenceType {
        RENTAL_CANDIDATE,
        POI,
        ROUTE,
        WEATHER,
        AIR_QUALITY
    }

    public enum EvidenceStatus {
        NORMAL,
        DELAYED,
        MISSING,
        STALE,
        TOO_SOON,
        UNAVAILABLE
    }

    public record Evidence(
            String evidenceId,
            String source,
            EvidenceStatus status,
            OffsetDateTime sourceTimestamp,
            Map<String, String> textFacts,
            Map<String, BigDecimal> numericFacts
    ) {
        public Evidence {
            if (evidenceId == null || evidenceId.isBlank()) {
                throw new IllegalArgumentException("evidenceId must not be blank");
            }
            if (source == null || source.isBlank()) {
                throw new IllegalArgumentException("source must not be blank");
            }
            Objects.requireNonNull(status, "status must not be null");
            textFacts = copyFacts(textFacts, "textFacts");
            numericFacts = copyFacts(numericFacts, "numericFacts");
        }

        private static <T> Map<String, T> copyFacts(Map<String, T> facts, String field) {
            if (facts == null) return Map.of();
            Map<String, T> copy = new LinkedHashMap<>();
            facts.forEach((name, value) -> {
                if (name == null || name.isBlank() || value == null) {
                    throw new IllegalArgumentException(field + " must contain non-blank names and non-null values");
                }
                copy.put(name, value);
            });
            return Map.copyOf(copy);
        }

        public boolean hasFact(String factName) {
            if (factName == null || factName.isBlank()) return false;
            return textFacts.containsKey(factName)
                    || numericFacts.containsKey(factName)
                    || factName.equals("source")
                    || factName.equals("status")
                    || factName.equals("sourceTimestamp") && sourceTimestamp != null;
        }
    }

    public record FactReference(EvidenceType type, String evidenceId, String factName) {}

    public record FactValue(FactReference reference, BigDecimal value) {}
}
