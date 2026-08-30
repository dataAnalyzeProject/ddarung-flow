package com.ddarungflow.journey.application;

import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.JourneyAiFailureStage;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyIntent;
import com.ddarungflow.journey.ai.PlaceReference;
import com.ddarungflow.journey.persistence.JourneyDecisionPersistencePort;
import com.ddarungflow.journey.returnprediction.HealthRequest;
import com.ddarungflow.journey.returnprediction.HealthResponse;
import com.ddarungflow.journey.returnprediction.PredictRequest;
import com.ddarungflow.journey.returnprediction.ReturnPredictionPort;
import com.ddarungflow.journey.returnprediction.ReturnPredictionResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JourneyPlanServiceTest {

    @Test
    void missingDestinationIsDeterministicallyClarifiedWithoutCandidates() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        CountingReturnPort returnPort = new CountingReturnPort();
        JourneyPlanService service = service(persistence, disabledAi(), returnPort);

        JourneyPlanService.Decision decision = service.plan(10L, formInput());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.revision()).isEqualTo(1);
        assertThat(decision.candidates()).isEmpty();
        assertThat(decision.warnings()).containsExactly("CLARIFICATION_REQUIRED");
        assertThat(persistence.decisions.getFirst().normalizedIntentJson()).doesNotContain("naturalLanguageText").doesNotContain("fixture");
        assertThat(returnPort.predictCalls).isZero();
    }

    @Test
    void usersCannotReadEachOthersDecisionsAndExpiredDecisionReturnsDistinctError() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        JourneyPlanService service = service(persistence, disabledAi(), new CountingReturnPort());
        JourneyPlanService.Decision decision = service.plan(10L, formInput());

        assertThatThrownBy(() -> service.find(20L, decision.decisionId()))
                .isInstanceOf(JourneyPlanService.DecisionMissing.class);
        persistence.decisions.set(0, expired(persistence.decisions.getFirst()));
        assertThatThrownBy(() -> service.find(10L, decision.decisionId()))
                .isInstanceOf(JourneyPlanService.DecisionExpired.class);
    }

    @Test
    void replanKeepsDecisionIdAndRejectsStaleExpectedRevision() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        JourneyPlanService service = service(persistence, disabledAi(), new CountingReturnPort());
        JourneyPlanService.Decision first = service.plan(10L, formInput());

        JourneyPlanService.Decision second = service.replan(10L, first.decisionId(), replanInput(1));

        assertThat(second.decisionId()).isEqualTo(first.decisionId());
        assertThat(second.revision()).isEqualTo(2);
        assertThat(persistence.decisions).hasSize(2);
        assertThatThrownBy(() -> service.replan(10L, first.decisionId(), replanInput(1)))
                .isInstanceOf(JourneyPlanService.RevisionConflict.class);
    }

    @Test
    void missingNaturalLanguageDestinationDoesNotCallAiOrFabricateAPlace() {
        JourneyPlanService service = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort());

        JourneyPlanService.Decision decision = service.plan(10L, naturalLanguageInputWithoutDestination());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.clarification().missingFields()).containsExactly("destination");
        assertThat(decision.candidates()).isEmpty();
    }

    @Test
    void passesOnlyValidatedNonSensitiveContextToNaturalLanguageCompile() {
        java.util.concurrent.atomic.AtomicReference<com.ddarungflow.journey.ai.JourneyCompileRequest> captured = new java.util.concurrent.atomic.AtomicReference<>();
        JourneyAiGateway contextAwareAi = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { throw new AssertionError("legacy compile path must not be used"); }
            @Override public IntentResult compileIntent(com.ddarungflow.journey.ai.JourneyCompileRequest request) {
                captured.set(request);
                return IntentResult.unavailable(JourneyAiErrorCode.AI_DISABLED);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };

        JourneyPlanService.PlanInput input = naturalLanguageInput();
        service(new InMemoryPersistence(), contextAwareAi, new CountingReturnPort()).plan(10L, input);

        assertThat(captured.get().origin()).isEqualTo(new PlaceReference("성수역", "place-origin"));
        assertThat(captured.get().destination()).isEqualTo(new PlaceReference("서울숲", "place-destination"));
        assertThat(captured.get().departureAt()).isEqualTo(input.departureAt());
        assertThat(captured.get().maxJourneyMinutes()).isEqualTo(60);
        assertThat(captured.get().requiredBikeCount()).isEqualTo(2);
        assertThat(captured.get().toString()).doesNotContain("37.54").doesNotContain("127.05");
    }

    @Test
    void mockAiClarificationIsPersistedWithoutProviderOutputLeakage() {
        JourneyAiGateway clarificationAi = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                return new IntentResult(new JourneyIntent(new PlaceReference("ORIGIN_A", ""), null, OffsetDateTime.now(), 60, 1,
                        java.util.Map.of(), java.util.Map.of(), List.of("destination"), true), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(new InMemoryPersistence(), clarificationAi, new CountingReturnPort());

        JourneyPlanService.Decision decision = service.plan(10L, naturalLanguageInput());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.warnings()).containsExactly("CLARIFICATION_REQUIRED");
        assertThat(decision.clarification().question()).isEqualTo("추가 여정 조건을 확인해 주세요.");
        assertThat(decision.clarification().missingFields()).containsExactly("destination");
        assertThat(service.find(10L, decision.decisionId()).clarification().missingFields()).containsExactly("destination");
        assertThat(decision.normalizedIntent().toString()).doesNotContain("성수에서 카페 포함");
    }

    @Test
    void malformedAiOutputPreservesTypedErrorWithoutProviderMessage() {
        JourneyAiGateway malformedAi = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "provider raw output: secret");
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(new InMemoryPersistence(), malformedAi, new CountingReturnPort());

        assertThatThrownBy(() -> service.plan(10L, naturalLanguageInput()))
                .isInstanceOf(JourneyPlanService.AiOutputSchemaInvalid.class)
                .hasMessageNotContaining("secret");
    }

    @Test
    void preservesOutputSchemaFailureStagesAtTheServiceBoundary() {
        for (JourneyAiFailureStage stage : List.of(JourneyAiFailureStage.RESPONSE_ENVELOPE, JourneyAiFailureStage.OUTPUT_TEXT_JSON,
                JourneyAiFailureStage.CANONICAL_SCHEMA, JourneyAiFailureStage.SEMANTIC_INTENT)) {
            JourneyAiGateway failingAi = failingAi(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "provider raw output", stage);

            assertThatThrownBy(() -> service(new InMemoryPersistence(), failingAi, new CountingReturnPort()).plan(10L, naturalLanguageInput()))
                    .isInstanceOf(JourneyPlanService.AiOutputSchemaInvalid.class)
                    .satisfies(exception -> assertThat(((JourneyPlanService.AiOutputSchemaInvalid) exception).failureStage()).isEqualTo(stage));
        }
    }

    @Test
    void preservesPiiBlockedAndToolMismatchCodesWithoutProviderMessage() {
        JourneyAiGateway piiAi = failingAi(JourneyAiErrorCode.AI_PII_BLOCKED, "provider raw input: secret");
        JourneyPlanService.Decision piiDecision = service(new InMemoryPersistence(), piiAi, new CountingReturnPort()).plan(10L, naturalLanguageInput());
        assertThat(piiDecision.warnings()).contains("AI_PII_BLOCKED").noneMatch(warning -> warning.contains("secret"));

        JourneyAiGateway mismatchAi = failingAi(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, "provider raw output: secret");
        assertThatThrownBy(() -> service(new InMemoryPersistence(), mismatchAi, new CountingReturnPort()).plan(10L, naturalLanguageInput()))
                .isInstanceOf(JourneyPlanService.AiToolValueMismatch.class)
                .hasMessageNotContaining("secret");
    }

    @Test
    void rejectsInvalidSelectedPlacesAndPastDepartureAt() {
        JourneyPlanService service = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort());
        JourneyPlanService.PlanInput valid = formInput();

        assertInvalid(service, new JourneyPlanService.PlanInput(valid.requestMode(), null,
                new JourneyPlanService.Place("", "성수역", 37.54, 127.05), null, valid.departureAt(), 60, 2, valid.preferences(), valid.avoid(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(valid.requestMode(), null,
                new JourneyPlanService.Place("origin", "성수역", null, 127.05), null, valid.departureAt(), 60, 2, valid.preferences(), valid.avoid(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(valid.requestMode(), null,
                new JourneyPlanService.Place("origin", "성수역", 91.0, 127.05), null, valid.departureAt(), 60, 2, valid.preferences(), valid.avoid(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(valid.requestMode(), null, valid.origin(),
                new JourneyPlanService.Place("destination", "", 37.55, 127.06), valid.departureAt(), 60, 2, valid.preferences(), valid.avoid(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(valid.requestMode(), null, valid.origin(), null,
                OffsetDateTime.now().minusMinutes(1), 60, 2, valid.preferences(), valid.avoid(), null));
    }

    @Test
    void formAndNaturalLanguageUseOnlyCoreCandidatesAndPersistTheirSnapshots() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        JourneyRentalPredictionPort rentalPort = request -> List.of(
                rental("station-1", "대여소 1", "0.81", 180, 450, "NORMAL", request.requiredBikeCount()),
                rental("station-2", "대여소 2", "0.70", 240, 500, "NORMAL", request.requiredBikeCount()));
        JourneyPlanService service = service(persistence, disabledAi(), new CountingReturnPort(), rentalPort);

        JourneyPlanService.Decision form = service.plan(10L, formInputWithDestination(3));
        JourneyPlanService.Decision naturalLanguage = service.plan(10L, naturalLanguageInput());

        assertThat(form.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.READY);
        assertThat(form.candidates()).extracting(candidate -> candidate.stationId()).containsExactly("station-1", "station-2");
        assertThat(form.candidates()).allSatisfy(candidate -> {
            assertThat(candidate.archetype()).isEqualTo(com.ddarungflow.journey.domain.JourneyArchetype.CORE_RENTAL);
            assertThat(candidate.requiredBikeCount()).isEqualTo(3);
            assertThat(candidate.returnProbability()).isNull();
            assertThat(candidate.cyclingMinutes()).isNull();
            assertThat(candidate.elevationMeters()).isNull();
            assertThat(candidate.bikeLanePercent()).isNull();
        });
        assertThat(naturalLanguage.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.READY);
        assertThat(naturalLanguage.candidates()).hasSize(2);
        assertThat(service.find(10L, form.decisionId()).candidates()).isEqualTo(form.candidates());
    }

    @Test
    void normalCoreCandidatesAreSortedDeterministicallyAndLimitedToThree() {
        JourneyRentalPredictionPort rentalPort = request -> List.of(
                rental("station-c", "C", "0.80", 180, 500, "NORMAL"),
                rental("station-b", "B", "0.80", 180, 400, "NORMAL"),
                rental("station-a", "A", "0.80", 120, 600, "NORMAL"),
                rental("station-d", "D", "0.79", 60, 100, "NORMAL"),
                rental("station-missing", "M", null, 1, 1, "MISSING"));
        JourneyPlanService service = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(), rentalPort);

        JourneyPlanService.Decision decision = service.plan(10L, formInputWithDestination(1));

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.PARTIAL);
        assertThat(decision.candidates()).extracting(candidate -> candidate.stationId())
                .containsExactly("station-a", "station-b", "station-c");
        assertThat(decision.candidates()).extracting(candidate -> candidate.rank()).containsExactly(1, 2, 3);
    }

    @Test
    void readbackCanonicalizesPersistedCandidateOrderByRankThenCandidateId() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        JourneyPlanService service = service(persistence, disabledAi(), new CountingReturnPort(), request -> List.of(
                rental("station-1", "One", "0.9", 60, 100, "NORMAL"),
                rental("station-2", "Two", "0.8", 120, 200, "NORMAL"),
                rental("station-3", "Three", "0.7", 180, 300, "NORMAL")));
        JourneyPlanService.Decision planned = service.plan(10L, formInputWithDestination(1));
        JourneyDecisionPersistencePort.StoredDecision stored = persistence.decisions.getFirst();
        persistence.decisions.set(0, new JourneyDecisionPersistencePort.StoredDecision(stored.decisionId(), stored.userId(), stored.revision(),
                stored.status(), stored.normalizedIntentJson(), stored.contractVersions(), stored.generatedAt(), stored.expiresAt(),
                List.of(stored.candidates().get(1), stored.candidates().get(2), stored.candidates().get(0))));

        assertThat(service.find(10L, planned.decisionId()).candidates()).extracting(candidate -> candidate.rank())
                .containsExactly(1, 2, 3);
        assertThat(service.find(10L, planned.decisionId()).candidates()).extracting(candidate -> candidate.candidateId())
                .containsExactly("station-1", "station-2", "station-3");
    }

    @Test
    void derivesReadyPartialAndUnavailableFromCorePredictionStatuses() {
        JourneyPlanService ready = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(),
                request -> List.of(rental("ready", "R", "0.70", 60, 100, "NORMAL")));
        JourneyPlanService partial = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(),
                request -> List.of(rental("partial", "P", "0.70", 60, 100, "NORMAL"), rental("missing", "M", null, 0, 0, "MISSING")));
        JourneyPlanService unavailable = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(),
                request -> List.of(rental("soon", "S", null, 0, 0, "TOO_SOON"), rental("down", "D", null, 0, 0, "UNAVAILABLE")));

        assertThat(ready.plan(10L, formInputWithDestination(1)).status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.READY);
        assertThat(partial.plan(10L, formInputWithDestination(1)).status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.PARTIAL);
        assertThat(unavailable.plan(10L, formInputWithDestination(1)).status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.UNAVAILABLE);
    }

    @Test
    void forwardsEverySupportedRequiredBikeCountToCoreWithoutCoercion() {
        List<Integer> receivedCounts = new ArrayList<>();
        JourneyRentalPredictionPort rentalPort = request -> {
            receivedCounts.add(request.requiredBikeCount());
            return List.of(rental("station", "S", "0.72", 60, 100, "NORMAL", request.requiredBikeCount()));
        };
        JourneyPlanService service = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(), rentalPort);

        for (int requiredBikeCount = 1; requiredBikeCount <= 5; requiredBikeCount++) {
            int expectedBikeCount = requiredBikeCount;
            JourneyPlanService.Decision decision = service.plan(10L, formInputWithDestination(requiredBikeCount));
            assertThat(decision.candidates()).singleElement().satisfies(candidate ->
                    assertThat(candidate.requiredBikeCount()).isEqualTo(expectedBikeCount));
        }

        assertThat(receivedCounts).containsExactly(1, 2, 3, 4, 5);
    }

    @Test
    void preservesLegacyCandidateSnapshotsForBackwardReads() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        persistence.decisions.add(new JourneyDecisionPersistencePort.StoredDecision("legacy", 10L, 1, "READY",
                "{\"destination\":{\"placeId\":\"old\"}}", "journey-api-03", OffsetDateTime.now(), OffsetDateTime.now().plusHours(1),
                List.of(new JourneyDecisionPersistencePort.StoredCandidate("legacy", "STABLE", """
                        {"candidateId":"legacy","archetype":"STABLE","rank":1,"rentalProbability":77,
                        "returnProbability":66,"cyclingMinutes":12,"distanceMeters":100,"elevationMeters":3,
                        "bikeLanePercent":50,"destinationName":"old","destinationCategory":"c","advantage":"a","tradeoff":"t"}
                        """, "{}"))));
        JourneyPlanService service = service(persistence, disabledAi(), new CountingReturnPort());

        JourneyPlanService.Decision decision = service.find(10L, "legacy");

        assertThat(decision.candidates()).singleElement().satisfies(candidate -> {
            assertThat(candidate.rentalProbability()).isEqualByComparingTo("77");
            assertThat(candidate.stationId()).isNull();
            assertThat(candidate.returnProbability()).isEqualByComparingTo("66");
        });
    }

    @Test
    void persistsTimeConsistentCoreRentalSnapshotWithoutChangingItsProbability() {
        OffsetDateTime departureAt = OffsetDateTime.parse("2030-08-30T10:20:00+09:00");
        OffsetDateTime arrivalAt = departureAt.plusMinutes(10);
        OffsetDateTime featureAsOf = OffsetDateTime.parse("2030-08-30T09:00:00+09:00");
        JourneyRentalPredictionPort rentalPort = request -> List.of(new JourneyRentalPredictionPort.RentalCandidate(
                "station-time", "시간 대여소", new java.math.BigDecimal("37.55"), new java.math.BigDecimal("127.05"),
                8, "NORMAL", featureAsOf, new java.math.BigDecimal("0.62"), request.requiredBikeCount(), "MEDIUM",
                800, 600, arrivalAt, featureAsOf.plusHours(2), 120L, featureAsOf, "model@1", featureAsOf, "NORMAL"));
        InMemoryPersistence persistence = new InMemoryPersistence();
        JourneyPlanService service = service(persistence, disabledAi(), new CountingReturnPort(), rentalPort);
        JourneyPlanService.PlanInput input = formInputWithDestination(2);
        input = new JourneyPlanService.PlanInput(input.requestMode(), input.naturalLanguageText(), input.origin(), input.destination(),
                departureAt, input.maxJourneyMinutes(), input.requiredBikeCount(), input.preferences(), input.avoid(), input.expectedRevision());

        JourneyPlanService.Decision saved = service.plan(10L, input);
        JourneyPlanService.Decision read = service.find(10L, saved.decisionId());

        assertThat(read.candidates()).singleElement().satisfies(candidate -> {
            assertThat(candidate.arrivalAt()).isEqualTo(departureAt.plusSeconds(candidate.accessDurationSeconds()));
            assertThat(candidate.predictionTargetAt()).isEqualTo(candidate.arrivalAt().plusMinutes(30).truncatedTo(java.time.temporal.ChronoUnit.HOURS));
            assertThat(candidate.horizonMinutes()).isEqualTo(java.time.temporal.ChronoUnit.MINUTES.between(candidate.featureAsOf(), candidate.predictionTargetAt()));
            assertThat(candidate.rentalProbability()).isEqualByComparingTo("0.62");
        });
    }

    private JourneyAiGateway failingAi(JourneyAiErrorCode code, String message) {
        return failingAi(code, message, null);
    }

    private JourneyAiGateway failingAi(JourneyAiErrorCode code, String message, JourneyAiFailureStage stage) {
        return new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { throw new JourneyAiException(code, message, stage); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
    }

    private void assertInvalid(JourneyPlanService service, JourneyPlanService.PlanInput input) {
        assertThatThrownBy(() -> service.plan(10L, input)).isInstanceOf(JourneyPlanService.InvalidJourneyInput.class);
    }

    private JourneyPlanService service(InMemoryPersistence persistence, JourneyAiGateway ai, ReturnPredictionPort returnPort) {
        return service(persistence, ai, returnPort, request -> List.of());
    }

    private JourneyPlanService service(InMemoryPersistence persistence, JourneyAiGateway ai, ReturnPredictionPort returnPort,
                                       JourneyRentalPredictionPort rentalPort) {
        return new JourneyPlanService(persistence, ai, returnPort, rentalPort, new ObjectMapper().findAndRegisterModules());
    }

    private JourneyAiGateway disabledAi() {
        return new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return IntentResult.unavailable(JourneyAiErrorCode.AI_DISABLED); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
    }

    private JourneyPlanService.PlanInput formInput() {
        return new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.FORM, null,
                new JourneyPlanService.Place("place-origin", "성수역", 37.54, 127.05), null,
                OffsetDateTime.now().plusHours(1), 60, 2, java.util.Map.of("lowSlope", "HIGH"), List.of("RAIN"), null);
    }

    private JourneyPlanService.PlanInput naturalLanguageInput() {
        JourneyPlanService.PlanInput form = formInput();
        return new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "성수에서 카페 포함", form.origin(),
                new JourneyPlanService.Place("place-destination", "서울숲", 37.544, 127.037),
                form.departureAt(), form.maxJourneyMinutes(), form.requiredBikeCount(), form.preferences(), form.avoid(), null);
    }

    private JourneyPlanService.PlanInput formInputWithDestination(int requiredBikeCount) {
        JourneyPlanService.PlanInput form = formInput();
        return new JourneyPlanService.PlanInput(form.requestMode(), form.naturalLanguageText(), form.origin(),
                new JourneyPlanService.Place("place-destination", "서울숲", 37.544, 127.037), form.departureAt(),
                form.maxJourneyMinutes(), requiredBikeCount, form.preferences(), form.avoid(), form.expectedRevision());
    }

    private JourneyRentalPredictionPort.RentalCandidate rental(String stationId, String stationName, String probability,
                                                                 int durationSeconds, int distanceMeters, String status) {
        return rental(stationId, stationName, probability, durationSeconds, distanceMeters, status, 1);
    }

    private JourneyRentalPredictionPort.RentalCandidate rental(String stationId, String stationName, String probability,
                                                                 int durationSeconds, int distanceMeters, String status,
                                                                 int requiredBikeCount) {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-30T09:00:00+09:00");
        return new JourneyRentalPredictionPort.RentalCandidate(stationId, stationName, new java.math.BigDecimal("37.55"),
                new java.math.BigDecimal("127.05"), 8, "NORMAL", now.minusMinutes(1),
                probability == null ? null : new java.math.BigDecimal(probability), requiredBikeCount, "HIGH", distanceMeters, durationSeconds,
                now.plusMinutes(5), now.plusHours(1), 60L, now, "model@1", now, status);
    }

    private JourneyPlanService.PlanInput naturalLanguageInputWithoutDestination() {
        JourneyPlanService.PlanInput form = formInput();
        return new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "성수에서 카페 포함", form.origin(), null,
                form.departureAt(), form.maxJourneyMinutes(), form.requiredBikeCount(), form.preferences(), form.avoid(), null);
    }

    private JourneyPlanService.PlanInput replanInput(int expectedRevision) {
        JourneyPlanService.PlanInput form = formInput();
        return new JourneyPlanService.PlanInput(form.requestMode(), form.naturalLanguageText(), form.origin(), form.destination(),
                form.departureAt(), form.maxJourneyMinutes(), form.requiredBikeCount(), form.preferences(), form.avoid(), expectedRevision);
    }

    private JourneyDecisionPersistencePort.StoredDecision expired(JourneyDecisionPersistencePort.StoredDecision source) {
        return new JourneyDecisionPersistencePort.StoredDecision(source.decisionId(), source.userId(), source.revision(), source.status(),
                source.normalizedIntentJson(), source.contractVersions(), source.generatedAt(), OffsetDateTime.now().minusSeconds(1), source.candidates());
    }

    private static final class InMemoryPersistence implements JourneyDecisionPersistencePort {
        private final List<StoredDecision> decisions = new ArrayList<>();

        @Override public StoredDecision save(DecisionToStore decision) {
            StoredDecision stored = new StoredDecision(decision.decisionId(), decision.userId(), decision.revision(), decision.status(),
                    decision.normalizedIntentJson(), decision.contractVersions(), decision.generatedAt(), decision.expiresAt(),
                    decision.candidates().stream().map(candidate -> new StoredCandidate(candidate.candidateKey(), candidate.archetype(),
                            candidate.snapshotJson(), candidate.provenanceJson())).toList());
            decisions.add(stored);
            return stored;
        }

        @Override public Optional<StoredDecision> findActiveDecision(String id, Long userId, OffsetDateTime now) {
            return decisions.stream().filter(decision -> decision.decisionId().equals(id) && decision.userId().equals(userId))
                    .filter(decision -> decision.expiresAt().isAfter(now)).max(Comparator.comparingInt(StoredDecision::revision));
        }

        @Override public boolean isExpired(String id, Long userId, OffsetDateTime now) {
            return decisions.stream().anyMatch(decision -> decision.decisionId().equals(id) && decision.userId().equals(userId)
                    && !decision.expiresAt().isAfter(now));
        }

        @Override public int deleteExpiredDecisions(OffsetDateTime now) { return 0; }
    }

    private static final class CountingReturnPort implements ReturnPredictionPort {
        private int predictCalls;
        @Override public HealthResponse health(HealthRequest request) { return null; }
        @Override public ReturnPredictionResult predict(PredictRequest request) { predictCalls++; return null; }
    }
}
