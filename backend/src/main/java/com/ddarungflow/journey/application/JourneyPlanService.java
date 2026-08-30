package com.ddarungflow.journey.application;

import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.JourneyAiFailureStage;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyCompileRequest;
import com.ddarungflow.journey.ai.JourneyIntent;
import com.ddarungflow.journey.ai.PlaceReference;
import com.ddarungflow.journey.domain.JourneyArchetype;
import com.ddarungflow.journey.domain.JourneyCandidate;
import com.ddarungflow.journey.domain.JourneyStatus;
import com.ddarungflow.journey.persistence.JourneyDecisionPersistencePort;
import com.ddarungflow.journey.returnprediction.ReturnPredictionPort;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

@Service
public class JourneyPlanService {
    private static final String CONTRACT_VERSIONS = "{\"api\":\"journey-api-03\",\"ai\":\"journey-ai-1\",\"return\":\"return-model-05\"}";

    private final JourneyDecisionPersistencePort persistence;
    private final JourneyAiGateway aiGateway;
    @SuppressWarnings("unused")
    private final ReturnPredictionPort returnPredictionPort;
    private final JourneyRentalPredictionPort rentalPredictionPort;
    private final ObjectMapper objectMapper;

    public JourneyPlanService(JourneyDecisionPersistencePort persistence, JourneyAiGateway aiGateway,
                              ReturnPredictionPort returnPredictionPort, JourneyRentalPredictionPort rentalPredictionPort,
                              ObjectMapper objectMapper) {
        this.persistence = persistence;
        this.aiGateway = aiGateway;
        this.returnPredictionPort = returnPredictionPort;
        this.rentalPredictionPort = rentalPredictionPort;
        this.objectMapper = objectMapper;
    }

    public Decision plan(long userId, PlanInput input) {
        validate(input, false);
        return persist(userId, UUID.randomUUID().toString(), 1, input);
    }

    public Decision find(long userId, String decisionId) {
        OffsetDateTime now = OffsetDateTime.now();
        return persistence.findActiveDecision(decisionId, userId, now)
                .map(this::toDecision)
                .orElseGet(() -> {
                    if (persistence.isExpired(decisionId, userId, now)) throw new DecisionExpired();
                    throw new DecisionMissing();
                });
    }

    public Decision replan(long userId, String decisionId, PlanInput input) {
        validate(input, true);
        Decision current = find(userId, decisionId);
        if (!current.revision().equals(input.expectedRevision())) throw new RevisionConflict();
        return persist(userId, decisionId, current.revision() + 1, input);
    }

    public Counterfactual counterfactual(long userId, String decisionId) {
        find(userId, decisionId);
        throw new NoValidCandidate();
    }

    private Decision persist(long userId, String decisionId, int revision, PlanInput input) {
        JourneyIntent aiIntent = null;
        List<String> warnings = new ArrayList<>();

        if (input.destination() == null) {
            return save(userId, decisionId, revision, input, null, JourneyStatus.CLARIFICATION_REQUIRED,
                    List.of(), List.of("CLARIFICATION_REQUIRED"));
        }

        boolean aiRequestedClarification = false;

        if (input.requestMode() == RequestMode.NATURAL_LANGUAGE) {
            try {
                JourneyAiGateway.IntentResult result = aiGateway.compileIntent(compileRequest(input));
                if (result.available()) {
                    aiIntent = result.intent();
                    if (aiIntent.needsClarification()) {
                        aiRequestedClarification = true;
                    }
                } else {
                    warnings.add(safeAiCode(result.unavailableCode()));
                }
            } catch (JourneyAiException exception) {
                if (exception.code() == JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID) throw new AiOutputSchemaInvalid(exception.failureStage());
                if (exception.code() == JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH) throw new AiToolValueMismatch();
                warnings.add(safeAiCode(exception.code()));
            }
        }

        if (aiRequestedClarification) {
            return save(userId, decisionId, revision, input, aiIntent, JourneyStatus.CLARIFICATION_REQUIRED,
                    List.of(), List.of("CLARIFICATION_REQUIRED"));
        }

        List<JourneyRentalPredictionPort.RentalCandidate> coreCandidates;
        try {
            coreCandidates = rentalPredictionPort.predict(new JourneyRentalPredictionPort.RentalPredictionRequest(
                    java.math.BigDecimal.valueOf(input.origin().latitude()), java.math.BigDecimal.valueOf(input.origin().longitude()),
                    java.math.BigDecimal.valueOf(input.destination().latitude()), java.math.BigDecimal.valueOf(input.destination().longitude()),
                    input.departureAt(), input.requiredBikeCount()));
        } catch (Exception exception) {
            coreCandidates = List.of();
        }

        int normalCandidateCount = (int) coreCandidates.stream().filter(candidate -> "NORMAL".equals(candidate.predictionStatus())).count();
        List<JourneyCandidate> candidates = toJourneyCandidates(coreCandidates, input);
        JourneyStatus status = candidates.isEmpty() ? JourneyStatus.UNAVAILABLE
                : normalCandidateCount == coreCandidates.size() ? JourneyStatus.READY : JourneyStatus.PARTIAL;
        if (status == JourneyStatus.UNAVAILABLE) warnings.add("JOURNEY_RENTAL_UNAVAILABLE");
        if (status == JourneyStatus.PARTIAL) warnings.add("JOURNEY_RENTAL_PARTIAL");
        return save(userId, decisionId, revision, input, aiIntent, status, candidates, warnings);
    }

    private Decision save(long userId, String decisionId, int revision, PlanInput input, JourneyIntent aiIntent,
                          JourneyStatus status, List<JourneyCandidate> candidates, List<String> warnings) {
        OffsetDateTime generatedAt = OffsetDateTime.now();
        JourneyDecisionPersistencePort.StoredDecision stored = persistence.save(new JourneyDecisionPersistencePort.DecisionToStore(
                decisionId, userId, revision, status.name(), normalizedIntent(input, aiIntent), CONTRACT_VERSIONS,
                generatedAt, candidates.stream().map(this::candidateToStore).toList()));
        return toDecision(stored, warnings);
    }

    private JourneyDecisionPersistencePort.CandidateToStore candidateToStore(JourneyCandidate candidate) {
        try {
            return new JourneyDecisionPersistencePort.CandidateToStore(candidate.candidateId(), candidate.archetype().name(),
                    objectMapper.writeValueAsString(candidate), "{\"source\":\"core-on-demand\"}");
        } catch (Exception exception) {
            throw new IllegalStateException("Journey candidate를 저장할 수 없습니다.", exception);
        }
    }

    private List<JourneyCandidate> toJourneyCandidates(List<JourneyRentalPredictionPort.RentalCandidate> coreCandidates,
                                                        PlanInput input) {
        List<JourneyRentalPredictionPort.RentalCandidate> normalCandidates = coreCandidates.stream()
                .filter(candidate -> "NORMAL".equals(candidate.predictionStatus()))
                .sorted(Comparator.comparing(JourneyRentalPredictionPort.RentalCandidate::rentalProbability,
                                Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(JourneyRentalPredictionPort.RentalCandidate::durationSeconds,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JourneyRentalPredictionPort.RentalCandidate::distanceMeters,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JourneyRentalPredictionPort.RentalCandidate::stationId,
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(3)
                .toList();
        return IntStream.range(0, normalCandidates.size())
                .mapToObj(index -> toJourneyCandidate(normalCandidates.get(index), input, index + 1))
                .toList();
    }

    private JourneyCandidate toJourneyCandidate(JourneyRentalPredictionPort.RentalCandidate candidate, PlanInput input, int rank) {
        return new JourneyCandidate(candidate.stationId(), JourneyArchetype.CORE_RENTAL, rank,
                candidate.rentalProbability(), null, null, candidate.distanceMeters(), null, null,
                input.destination().displayName(), null, null, null, candidate.stationId(), candidate.stationName(),
                candidate.latitude(), candidate.longitude(), candidate.requiredBikeCount(), candidate.availableBikeCount(),
                candidate.inventoryStatus(), candidate.inventoryCollectedAt(), candidate.availabilityLevel(),
                candidate.durationSeconds(), candidate.arrivalAt(), candidate.predictionTargetAt(), candidate.horizonMinutes(),
                candidate.featureAsOf(), candidate.modelVersion(), candidate.generatedAt(), candidate.predictionStatus());
    }

    private String normalizedIntent(PlanInput input, JourneyIntent aiIntent) {
        try {
            Map<String, Object> normalized = new java.util.LinkedHashMap<>();
            normalized.put("requestMode", input.requestMode());
            normalized.put("origin", input.origin());
            normalized.put("destination", input.destination());
            normalized.put("departureAt", input.departureAt());
            normalized.put("maxJourneyMinutes", input.maxJourneyMinutes());
            normalized.put("requiredBikeCount", input.requiredBikeCount());
            normalized.put("preferences", input.preferences());
            normalized.put("avoid", input.avoid());
            if (aiIntent != null) normalized.put("aiIntent", aiIntent);
            return objectMapper.writeValueAsString(normalized);
        } catch (Exception exception) {
            throw new IllegalStateException("Journey normalized intent를 저장할 수 없습니다.", exception);
        }
    }

    private JourneyCompileRequest compileRequest(PlanInput input) {
        return new JourneyCompileRequest(input.naturalLanguageText(), toPlaceReference(input.origin()), toPlaceReference(input.destination()),
                input.departureAt(), input.maxJourneyMinutes(), input.requiredBikeCount());
    }

    private PlaceReference toPlaceReference(Place place) {
        return place == null ? null : new PlaceReference(place.displayName(), place.placeId());
    }

    private Decision toDecision(JourneyDecisionPersistencePort.StoredDecision stored) {
        return toDecision(stored, warningsFor(stored.status()));
    }

    private Decision toDecision(JourneyDecisionPersistencePort.StoredDecision stored, List<String> warnings) {
        try {
            JsonNode normalizedIntent = objectMapper.readTree(stored.normalizedIntentJson());
            List<JourneyCandidate> candidates = stored.candidates().stream()
                    .map(candidate -> readCandidate(candidate.snapshotJson()))
                    .sorted(Comparator.comparing(JourneyCandidate::rank, Comparator.nullsLast(Comparator.naturalOrder()))
                            .thenComparing(JourneyCandidate::candidateId, Comparator.nullsLast(Comparator.naturalOrder())))
                    .toList();
            return new Decision(stored.decisionId(), stored.revision(), JourneyStatus.valueOf(stored.status()),
                    normalizedIntent, clarificationFor(stored.status(), normalizedIntent), candidates, warnings, stored.expiresAt());
        } catch (Exception exception) {
            throw new IllegalStateException("저장된 Journey decision을 읽을 수 없습니다.", exception);
        }
    }

    private JourneyCandidate readCandidate(String snapshot) {
        try {
            return objectMapper.readValue(snapshot, JourneyCandidate.class);
        } catch (Exception exception) {
            throw new IllegalStateException("저장된 Journey candidate를 읽을 수 없습니다.", exception);
        }
    }

    private List<String> warningsFor(String status) {
        if (JourneyStatus.CLARIFICATION_REQUIRED.name().equals(status)) return List.of("CLARIFICATION_REQUIRED");
        if (JourneyStatus.PARTIAL.name().equals(status)) return List.of("JOURNEY_RENTAL_PARTIAL");
        if (JourneyStatus.READY.name().equals(status)) return List.of();
        return List.of("JOURNEY_RENTAL_UNAVAILABLE");
    }

    private String safeAiCode(JourneyAiErrorCode code) {
        return code == JourneyAiErrorCode.AI_DISABLED ? JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE.name() : code.name();
    }

    private void validate(PlanInput input, boolean replan) {
        if (input == null || input.requestMode() == null || !validPlace(input.origin()) || !validOptionalPlace(input.destination())
                || input.departureAt() == null || !input.departureAt().isAfter(OffsetDateTime.now())
                || input.maxJourneyMinutes() == null || input.maxJourneyMinutes() < 1
                || input.requiredBikeCount() == null || input.requiredBikeCount() < 1 || input.requiredBikeCount() > 5
                || (input.requestMode() == RequestMode.NATURAL_LANGUAGE && blank(input.naturalLanguageText()))
                || (replan && input.expectedRevision() == null)) {
            throw new InvalidJourneyInput();
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private boolean validOptionalPlace(Place place) {
        return place == null || validPlace(place);
    }

    private boolean validPlace(Place place) {
        return place != null && !blank(place.placeId()) && !blank(place.displayName())
                && finiteBetween(place.latitude(), -90, 90) && finiteBetween(place.longitude(), -180, 180);
    }

    private boolean finiteBetween(Double value, double minimum, double maximum) {
        return value != null && Double.isFinite(value) && value >= minimum && value <= maximum;
    }

    private Clarification clarificationFor(String status, JsonNode normalizedIntent) {
        if (!JourneyStatus.CLARIFICATION_REQUIRED.name().equals(status)) return null;
        List<String> missingFields = new ArrayList<>();
        if (normalizedIntent.path("destination").isMissingNode() || normalizedIntent.path("destination").isNull()) {
            missingFields.add("destination");
        }
        for (JsonNode field : normalizedIntent.path("aiIntent").path("missingFields")) {
            if (field.isTextual() && !field.asText().isBlank() && !missingFields.contains(field.asText())) {
                missingFields.add(field.asText());
            }
        }
        return new Clarification("추가 여정 조건을 확인해 주세요.", List.copyOf(missingFields));
    }

    public enum RequestMode { FORM, NATURAL_LANGUAGE }

    public record Place(String placeId, String displayName, Double latitude, Double longitude) { }
    public record PlanInput(RequestMode requestMode, String naturalLanguageText, Place origin, Place destination,
                            OffsetDateTime departureAt, Integer maxJourneyMinutes, Integer requiredBikeCount,
                            Map<String, Object> preferences, List<String> avoid, Integer expectedRevision) {
        public PlanInput {
            preferences = preferences == null ? Map.of() : Map.copyOf(preferences);
            avoid = avoid == null ? List.of() : List.copyOf(avoid);
        }
    }
    public record Decision(String decisionId, Integer revision, JourneyStatus status, JsonNode normalizedIntent,
                           Clarification clarification, List<JourneyCandidate> candidates, List<String> warnings,
                           OffsetDateTime expiresAt) { }
    public record Clarification(String question, List<String> missingFields) { }
    public record Counterfactual(String status, List<String> unavailableFields) { }
    public static class InvalidJourneyInput extends RuntimeException { }
    public static class DecisionMissing extends RuntimeException { }
    public static class DecisionExpired extends RuntimeException { }
    public static class RevisionConflict extends RuntimeException { }
    public static class NoValidCandidate extends RuntimeException { }
    public static class AiOutputSchemaInvalid extends RuntimeException {
        private final JourneyAiFailureStage failureStage;

        public AiOutputSchemaInvalid(JourneyAiFailureStage failureStage) {
            this.failureStage = failureStage;
        }

        public JourneyAiFailureStage failureStage() {
            return failureStage;
        }
    }
    public static class AiToolValueMismatch extends RuntimeException { }
}
