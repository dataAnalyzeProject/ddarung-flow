package com.ddarungflow.journey.application;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.EvidenceSelectionValidator;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.JourneyAiFailureStage;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyIntent;
import com.ddarungflow.journey.ai.PlaceReference;
import com.ddarungflow.journey.domain.JourneyStatus;
import com.ddarungflow.journey.domain.UnifiedJourneyPlan;
import com.ddarungflow.journey.persistence.JourneyDecisionPersistencePort;
import com.ddarungflow.journey.returnprediction.HealthRequest;
import com.ddarungflow.journey.returnprediction.HealthResponse;
import com.ddarungflow.journey.returnprediction.PredictRequest;
import com.ddarungflow.journey.returnprediction.ReturnPredictionPort;
import com.ddarungflow.journey.returnprediction.ReturnPredictionResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

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
    void missingNaturalLanguageDestinationCallsAiAndRequiresVerifiedPlace() {
        JourneyPlanService service = service(new InMemoryPersistence(), availableAi(), new CountingReturnPort());

        JourneyPlanService.Decision decision = service.plan(10L, naturalLanguageInputWithoutDestination());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.clarification().missingFields()).containsExactly("destination");
        assertThat(decision.candidates()).isEmpty();
    }

    @Test
    void textOnlyCompilesBeforeRequiringPlacesAndNeverRunsFactualProviders() {
        AtomicInteger compileCalls = new AtomicInteger();
        AtomicInteger entitlementChecks = new AtomicInteger();
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                assertThat(entitlementChecks).hasValue(1);
                compileCalls.incrementAndGet();
                return new IntentResult(new JourneyIntent(null, new PlaceReference("서울숲", "invented-id"),
                        null, 90, 1, Map.of(), Map.of(), List.of("origin", "startAt"), true), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(new InMemoryPersistence(), ai, new CountingReturnPort(), request -> {
            throw new AssertionError("factual prediction cannot run before structured confirmation");
        });

        JourneyPlanService.Decision decision = service.plan(10L, textOnlyInput("서울숲에서 자전거 타고 싶어"),
                entitlementChecks::incrementAndGet);

        assertThat(compileCalls).hasValue(1);
        assertThat(decision.status()).isEqualTo(JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.clarification().missingFields())
                .contains("origin", "destination", "departureAt", "maxJourneyMinutes", "requiredBikeCount");
        assertThat(decision.normalizedIntent().path("destination").isNull()).isTrue();
        assertThat(decision.normalizedIntent().path("aiIntent").path("destination").path("displayName").asText()).isEqualTo("서울숲");
        assertThat(decision.normalizedIntent().path("aiIntent").path("destination").path("placeId").asText()).isEmpty();
        assertThat(decision.candidates()).isEmpty();
        assertThat(decision.unifiedPlan()).isNull();
    }

    @Test
    void textOnlyUsesOneToFiveHundredCharactersAndFormStillRequiresStructuredInput() {
        AtomicInteger compileCalls = new AtomicInteger();
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                compileCalls.incrementAndGet();
                return new IntentResult(validIntent(), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(new InMemoryPersistence(), ai, new CountingReturnPort());
        for (String text : List.of("가", "가".repeat(500), "🚲".repeat(500))) {
            assertThat(service.plan(10L, textOnlyInput(text)).status()).isEqualTo(JourneyStatus.CLARIFICATION_REQUIRED);
        }
        for (String text : List.of("", "   ", "가".repeat(501), "🚲".repeat(501))) assertInvalid(service, textOnlyInput(text));
        assertInvalid(service, textOnlyInput(null));
        assertInvalid(service, new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.FORM, null,
                null, null, null, null, null, Map.of(), List.of(), null));
        assertThat(compileCalls).hasValue(3);
    }

    @Test
    void malformedOptionalContextIsRejectedBeforeCompile() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { throw new AssertionError("invalid context cannot compile"); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(new InMemoryPersistence(), ai, new CountingReturnPort());
        assertInvalid(service, new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 여정",
                new JourneyPlanService.Place("origin", "성수역", null, 127.05), null, null, null, null, Map.of(), List.of(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 여정",
                null, null, OffsetDateTime.now().minusMinutes(1), null, null, Map.of(), List.of(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 여정",
                null, null, null, 0, 6, Map.of(), List.of(), null));
        assertInvalid(service, new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 여정",
                null, null, null, 481, 1, Map.of(), List.of(), null));
    }

    @Test
    void journeyDurationAcceptsTheUpperBoundaryAndRejectsItInBothModesWhenExceeded() {
        JourneyPlanService service = service(new InMemoryPersistence(), availableAi(), new CountingReturnPort());
        for (JourneyPlanService.RequestMode mode : JourneyPlanService.RequestMode.values()) {
            JourneyPlanService.PlanInput form = formInputWithDestination(1);
            JourneyPlanService.PlanInput boundary = new JourneyPlanService.PlanInput(mode,
                    mode == JourneyPlanService.RequestMode.NATURAL_LANGUAGE ? "서울숲 여정" : null,
                    form.origin(), form.destination(), form.departureAt(), 480, 1, Map.of(), List.of(), null);
            assertThat(service.plan(10L, boundary)).isNotNull();
            assertInvalid(service, new JourneyPlanService.PlanInput(mode, boundary.naturalLanguageText(),
                    form.origin(), form.destination(), form.departureAt(), 481, 1, Map.of(), List.of(), null));
        }
    }

    @Test
    void deniedEntitlementStopsTextOnlyBeforeCompileAndPersistence() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { throw new AssertionError("denied entitlement cannot compile"); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(persistence, ai, new CountingReturnPort());
        assertThatThrownBy(() -> service.plan(10L, textOnlyInput("서울숲 여정"), () -> {
            throw new com.ddarungflow.payment.PremiumEntitlementService.PremiumRequired();
        })).isInstanceOf(com.ddarungflow.payment.PremiumEntitlementService.PremiumRequired.class);
        assertThat(persistence.decisions).isEmpty();
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
            @Override public IntentResult compileIntent(String input) { throw new AssertionError("context compile required"); }
            @Override public IntentResult compileIntent(com.ddarungflow.journey.ai.JourneyCompileRequest request) {
                return new IntentResult(new JourneyIntent(new PlaceReference("성수역", "place-origin"),
                        new PlaceReference("서울숲", "place-destination"), request.departureAt(), 60, 2,
                        java.util.Map.of(), java.util.Map.of(), List.of("theme"), true), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService service = service(new InMemoryPersistence(), clarificationAi, new CountingReturnPort());

        JourneyPlanService.Decision decision = service.plan(10L, naturalLanguageInput());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.warnings()).containsExactly("CLARIFICATION_REQUIRED");
        assertThat(decision.clarification().question()).isEqualTo("추가 여정 조건을 확인해 주세요.");
        assertThat(decision.clarification().missingFields()).containsExactly("theme");
        assertThat(service.find(10L, decision.decisionId()).clarification().missingFields()).containsExactly("theme");
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
    void formUsesCoreCandidatesWhileUnavailableNaturalLanguageDoesNotRunFactualPlanning() {
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
        assertThat(naturalLanguage.status()).isEqualTo(JourneyStatus.UNAVAILABLE);
        assertThat(naturalLanguage.candidates()).isEmpty();
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
    void distinguishesRentalProviderEmptyErrorAndUnavailableEvidence() {
        JourneyPlanService empty = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(), request -> List.of());
        JourneyPlanService error = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(), request -> {
            throw new IllegalStateException("provider down");
        });
        JourneyPlanService unavailable = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort(),
                request -> List.of(rental("missing", "M", null, 0, 0, "MISSING")));

        assertThat(empty.plan(10L, formInputWithDestination(1)).warnings()).containsExactly("JOURNEY_RENTAL_EMPTY");
        assertThat(error.plan(10L, formInputWithDestination(1)).warnings()).containsExactly("JOURNEY_RENTAL_PROVIDER_ERROR");
        assertThat(unavailable.plan(10L, formInputWithDestination(1)).warnings())
                .containsExactly("JOURNEY_RENTAL_UNAVAILABLE");
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

    @Test
    void buildsAndPersistsTheUnifiedTimelineOnlyFromAuthoritativeEvidence() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        CountingReturnPort returnPort = new CountingReturnPort();
        JourneyPlanService service = unifiedService(persistence, disabledAi(), returnPort, completeEvidence());

        JourneyPlanService.Decision decision = service.plan(10L, unifiedInput(JourneyPlanService.RequestMode.FORM, null));

        assertThat(decision.status()).isEqualTo(JourneyStatus.READY);
        assertThat(decision.unifiedPlan().status()).isEqualTo(UnifiedJourneyPlan.Status.READY);
        assertThat(decision.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT,
                        UnifiedJourneyPlan.SegmentType.RIDE, UnifiedJourneyPlan.SegmentType.VISIT);
        assertThat(decision.unifiedPlan().segments().get(0)).satisfies(segment -> {
            assertThat(segment.durationSeconds()).isEqualTo(300);
            assertThat(segment.distanceMeters()).isEqualTo(500);
            assertThat(segment.pathPoints()).hasSize(2);
        });
        assertThat(decision.unifiedPlan().segments().get(1).rentalFacts()).satisfies(facts -> {
            assertThat(facts.stationId()).isEqualTo("station-1");
            assertThat(facts.rentalProbability()).isEqualByComparingTo("0.81");
            assertThat(facts.availableBikeCount()).isEqualTo(8);
        });
        assertThat(decision.unifiedPlan().segments().get(2)).satisfies(segment -> {
            assertThat(segment.durationSeconds()).isEqualTo(300);
            assertThat(segment.distanceMeters()).isEqualTo(900);
            assertThat(segment.travelMode()).isEqualTo("BICYCLE");
        });
        assertThat(decision.unifiedPlan().segments().get(3).stayMinutes()).isEqualTo(30);
        assertThat(decision.unifiedPlan().evidence().rentalCandidates().get("rental:station-1")
                .numericFacts().get("rentalProbability")).isEqualByComparingTo("0.81");
        assertThat(service.find(10L, decision.decisionId()).unifiedPlan()).isEqualTo(decision.unifiedPlan());
        assertThat(returnPort.predictCalls).isZero();
    }

    @Test
    void unknownAiEvidenceRetainsOnlyActualFactualSegments() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                return new ScheduleResult(new EvidenceSelectionValidator.Selection(
                        "rental:unknown", List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                        "근거 ID 선택", List.of("EVIDENCE_ONLY")), null);
            }
        };

        JourneyPlanService.Decision decision = planAndConfirm(unifiedService(new InMemoryPersistence(), ai, new CountingReturnPort(), completeEvidence()),
                unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));
        assertRejectedSchedule(decision);
        assertThat(decision.unifiedPlan().evidence().rentalCandidates()).containsOnlyKeys("rental:station-1");
        assertThat(decision.unifiedPlan().selectedRentalCandidateId()).isEqualTo("rental:station-1");
    }

    @Test
    void discardsModelPlaceIdsAndKeepsSelectedContextForConfirmation() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                JourneyIntent intent = validIntent();
                return new IntentResult(new JourneyIntent(intent.origin(), new PlaceReference("다른 공원", "unknown-place"),
                        intent.startAt().plusHours(1), 240, 4, intent.preferences(),
                        intent.hardConstraints(), intent.missingFields(), false), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService.PlanInput input = unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정");
        JourneyPlanService.Decision decision = unifiedService(new InMemoryPersistence(), ai, new CountingReturnPort(), completeEvidence())
                .plan(10L, input);

        assertThat(decision.status()).isEqualTo(JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.candidates()).isEmpty();
        assertThat(decision.unifiedPlan()).isNull();
        assertThat(decision.normalizedIntent().path("destination").path("placeId").asText()).isEqualTo("destination-1");
        assertThat(decision.normalizedIntent().path("aiIntent").path("destination").path("placeId").asText()).isEmpty();
        assertThat(decision.normalizedIntent().path("requiredBikeCount").asInt()).isEqualTo(2);
        assertThat(decision.normalizedIntent().path("maxJourneyMinutes").asInt()).isEqualTo(120);
        assertThat(decision.normalizedIntent().path("contextConflicts")).extracting(com.fasterxml.jackson.databind.JsonNode::asText)
                .containsExactly("destination", "departureAt", "maxJourneyMinutes", "requiredBikeCount");
    }

    @Test
    void unsupportedAiConstraintsRetainActualRentalEvidenceWithoutInventingARoute() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                JourneyIntent intent = validIntent();
                return new IntentResult(new JourneyIntent(intent.origin(), intent.destination(), intent.startAt(),
                        intent.totalMinutes(), intent.requiredBikeCount(), intent.preferences(),
                        Map.of("theme", "CAFE", "stopCount", 1, "routeMode", "FLYING"), List.of(), false), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };

        JourneyPlanService.PlanInput input = unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정");
        input = new JourneyPlanService.PlanInput(input.requestMode(), input.naturalLanguageText(), input.origin(), input.destination(),
                input.departureAt(), input.maxJourneyMinutes(), input.requiredBikeCount(), input.preferences(), input.avoid(), null,
                new JourneyPlanService.PlanConstraints(120, List.of("CAFE"), 1, null));
        JourneyPlanService.PlanInput invalidRouteInput = input;

        JourneyPlanService.Decision decision = planAndConfirm(unifiedService(new InMemoryPersistence(), ai, new CountingReturnPort(), completeEvidence()),
                invalidRouteInput);
        assertRejectedSchedule(decision);
    }

    @Test
    void retainsFactualAccessAndRentSegmentsWhenTheAiProviderIsUnavailable() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
        };
        JourneyPlanService.Decision decision = planAndConfirm(unifiedService(new InMemoryPersistence(), ai,
                new CountingReturnPort(), completeEvidence()),
                unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));

        assertThat(decision.status()).isEqualTo(JourneyStatus.UNAVAILABLE);
        assertThat(decision.warnings()).contains("AI_PROVIDER_UNAVAILABLE");
        assertThat(decision.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT);
    }

    @Test
    void invalidScheduleSchemaRetainsFactualSegmentsAndTheCompiledDraft() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "sensitive provider payload",
                        JourneyAiFailureStage.CANONICAL_SCHEMA);
            }
        };
        JourneyPlanService.Decision decision = planAndConfirm(unifiedService(new InMemoryPersistence(), ai,
                new CountingReturnPort(), completeEvidence()), unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));

        assertThat(decision.status()).isEqualTo(JourneyStatus.UNAVAILABLE);
        assertThat(decision.warnings()).contains("AI_OUTPUT_SCHEMA_INVALID");
        assertThat(decision.normalizedIntent().path("aiIntent").isObject()).isTrue();
        assertThat(decision.normalizedIntent().toString()).doesNotContain("sensitive provider payload");
        assertThat(decision.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT);
    }

    @Test
    void unavailableCompileCannotSilentlySwitchStructuredContinuationToDeterministicSchedule() {
        JourneyPlanService.Decision decision = planAndConfirm(unifiedService(new InMemoryPersistence(), disabledAi(),
                new CountingReturnPort(), completeEvidence()), unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));

        assertThat(decision.status()).isEqualTo(JourneyStatus.UNAVAILABLE);
        assertThat(decision.warnings()).contains("AI_SCHEDULE_UNAVAILABLE");
        assertThat(decision.normalizedIntent().path("plannerMode").asText()).isEqualTo("NATURAL_LANGUAGE");
    }

    @Test
    void deterministicScheduleUsesTheAvailableWindowInsteadOfExceedingIt() {
        JourneyPlanService.PlanInput input = unifiedInput(JourneyPlanService.RequestMode.FORM, null);
        input = new JourneyPlanService.PlanInput(input.requestMode(), null, input.origin(), input.destination(),
                input.departureAt(), input.maxJourneyMinutes(), input.requiredBikeCount(), input.preferences(), input.avoid(),
                null, new JourneyPlanService.PlanConstraints(20, List.of("CAFE"), 1, "BIKE_ONLY"));

        JourneyPlanService.Decision decision = unifiedService(new InMemoryPersistence(), disabledAi(),
                new CountingReturnPort(), completeEvidence()).plan(10L, input);

        assertThat(decision.status()).isEqualTo(JourneyStatus.READY);
        assertThat(decision.unifiedPlan().segments().getLast().stayMinutes()).isEqualTo(10);
        assertThat(decision.unifiedPlan().segments().getLast().endAt()).isEqualTo(input.departureAt().plusMinutes(20));
    }

    @Test
    void structuredReplanReusesIntentWithoutASecondNaturalLanguageCompile() {
        AtomicInteger compileCalls = new AtomicInteger();
        AtomicInteger scheduleCalls = new AtomicInteger();
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                compileCalls.incrementAndGet();
                return new IntentResult(validIntent(), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                scheduleCalls.incrementAndGet();
                return new ScheduleResult(validSelection(), null);
            }
        };
        JourneyPlanService service = unifiedService(new InMemoryPersistence(), ai, new CountingReturnPort(), completeEvidence());
        JourneyPlanService.Decision first = service.plan(10L,
                unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));
        JourneyPlanService.PlanInput structured = unifiedInput(JourneyPlanService.RequestMode.FORM, null);
        structured = new JourneyPlanService.PlanInput(structured.requestMode(), null, structured.origin(), structured.destination(),
                structured.departureAt(), structured.maxJourneyMinutes(), structured.requiredBikeCount(),
                structured.preferences(), structured.avoid(), first.revision(), structured.constraints());

        JourneyPlanService.Decision second = service.replan(10L, first.decisionId(), structured);

        assertThat(second.revision()).isEqualTo(2);
        assertThat(second.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT,
                        UnifiedJourneyPlan.SegmentType.RIDE, UnifiedJourneyPlan.SegmentType.VISIT);
        assertThat(compileCalls).hasValue(1);
        assertThat(first.status()).isEqualTo(JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(first.candidates()).isEmpty();
        assertThat(first.unifiedPlan()).isNull();
        assertThat(second.normalizedIntent().path("plannerMode").asText()).isEqualTo("NATURAL_LANGUAGE");
        assertThat(second.normalizedIntent().path("aiIntent")).isEqualTo(first.normalizedIntent().path("aiIntent"));
        assertThat(scheduleCalls).hasValue(1);
    }

    @Test
    void structuredClarificationAnswerCanContinueWithoutAnotherFreeTextTurn() {
        JourneyPlanService service = unifiedService(new InMemoryPersistence(), availableAi(),
                new CountingReturnPort(), completeEvidence());
        JourneyPlanService.PlanInput initial = unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE,
                "서울숲 주변 카페 여정");
        initial = new JourneyPlanService.PlanInput(initial.requestMode(), initial.naturalLanguageText(), initial.origin(), null,
                initial.departureAt(), initial.maxJourneyMinutes(), initial.requiredBikeCount(), initial.preferences(),
                initial.avoid(), null, initial.constraints());
        JourneyPlanService.Decision clarification = service.plan(10L, initial);
        JourneyPlanService.PlanInput answer = unifiedInput(JourneyPlanService.RequestMode.FORM, null);
        answer = new JourneyPlanService.PlanInput(answer.requestMode(), null, answer.origin(), answer.destination(),
                answer.departureAt(), answer.maxJourneyMinutes(), answer.requiredBikeCount(), answer.preferences(), answer.avoid(),
                clarification.revision(), answer.constraints());

        JourneyPlanService.Decision decision = service.replan(10L, clarification.decisionId(), answer);

        assertThat(clarification.status()).isEqualTo(JourneyStatus.CLARIFICATION_REQUIRED);
        assertThat(decision.status()).isEqualTo(JourneyStatus.READY);
        assertThat(decision.revision()).isEqualTo(2);
    }

    @Test
    void confirmedEmptyThemesDoNotReintroduceAiPreferencesOrThemeConstraints() {
        AtomicInteger scheduleCalls = new AtomicInteger();
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                JourneyIntent intent = validIntent();
                return new IntentResult(new JourneyIntent(intent.origin(), intent.destination(), intent.startAt(),
                        intent.totalMinutes(), intent.requiredBikeCount(), Map.of("cafe", 5, "culture", 3),
                        intent.hardConstraints(), List.of(), false), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                // With zero stops to choose from, the service must not spend an AI call on it:
                // a real provider has nothing meaningful to select and either times out or
                // rejects the response validation, so this stays unreachable.
                scheduleCalls.incrementAndGet();
                throw new AssertionError("selectSchedule must not be called when there are zero stops to select");
            }
        };
        JourneyPlanService service = unifiedService(new InMemoryPersistence(), ai, new CountingReturnPort(), completeEvidence());
        JourneyPlanService.Decision initial = service.plan(10L, textOnlyInput("서울숲 카페 여정"));
        JourneyPlanService.PlanInput form = unifiedInput(JourneyPlanService.RequestMode.FORM, null);
        JourneyPlanService.Decision decision = service.replan(10L, initial.decisionId(), new JourneyPlanService.PlanInput(
                form.requestMode(), null, form.origin(), form.destination(), form.departureAt(), form.maxJourneyMinutes(),
                form.requiredBikeCount(), form.preferences(), form.avoid(), initial.revision(),
                new JourneyPlanService.PlanConstraints(120, List.of(), null, "BIKE_ONLY")));

        assertThat(scheduleCalls).hasValue(0);
        assertThat(decision.status()).isEqualTo(JourneyStatus.PARTIAL);
        assertThat(decision.warnings()).contains("POI_THEME_MISSING").doesNotContain("AI_TOOL_VALUE_MISMATCH");
        assertThat(decision.unifiedPlan().evidence().pois()).isEmpty();
        assertThat(decision.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT);
    }

    @Test
    void textOnlyDraftContinuesWithConfirmedCoordinatesAndRechecksEntitlementBeforeSchedule() {
        AtomicInteger compileCalls = new AtomicInteger();
        AtomicInteger scheduleCalls = new AtomicInteger();
        AtomicInteger entitlementChecks = new AtomicInteger();
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) {
                compileCalls.incrementAndGet();
                return new IntentResult(new JourneyIntent(null, null, null, null, null,
                        Map.of("cafe", 3), Map.of(), List.of("origin", "destination", "startAt"), true), null);
            }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                assertThat(entitlementChecks).hasValue(3);
                scheduleCalls.incrementAndGet();
                return new ScheduleResult(validSelection(), null);
            }
        };
        JourneyRentalPredictionPort rentalPort = request -> {
            assertThat(request.originLatitude()).isEqualByComparingTo("37.544");
            assertThat(request.destinationLongitude()).isEqualByComparingTo("127.039");
            assertThat(request.requiredBikeCount()).isEqualTo(2);
            return List.of(rentalWithAccess(request));
        };
        JourneyPlanService service = new JourneyPlanService(new InMemoryPersistence(), ai, new CountingReturnPort(),
                rentalPort, completeEvidence(), new ObjectMapper().findAndRegisterModules());
        JourneyPlanService.Decision draft = service.plan(10L, textOnlyInput("한 시간 카페 여정"), entitlementChecks::incrementAndGet);
        JourneyPlanService.PlanInput form = unifiedInput(JourneyPlanService.RequestMode.FORM, null);
        JourneyPlanService.PlanInput confirmed = new JourneyPlanService.PlanInput(form.requestMode(), null, form.origin(), form.destination(),
                form.departureAt(), form.maxJourneyMinutes(), form.requiredBikeCount(), form.preferences(), form.avoid(), draft.revision(), form.constraints());

        assertThatThrownBy(() -> service.replan(10L, draft.decisionId(), confirmed, () -> {
            entitlementChecks.incrementAndGet();
            throw new com.ddarungflow.payment.PremiumEntitlementService.PremiumRequired();
        })).isInstanceOf(com.ddarungflow.payment.PremiumEntitlementService.PremiumRequired.class);
        assertThat(scheduleCalls).hasValue(0);
        assertThat(service.find(10L, draft.decisionId()).revision()).isEqualTo(1);

        JourneyPlanService.Decision completed = service.replan(10L, draft.decisionId(), confirmed, entitlementChecks::incrementAndGet);
        assertThat(completed.status()).isEqualTo(JourneyStatus.READY);
        assertThat(completed.normalizedIntent().path("plannerMode").asText()).isEqualTo("NATURAL_LANGUAGE");
        assertThat(completed.normalizedIntent().path("aiIntent")).isEqualTo(draft.normalizedIntent().path("aiIntent"));
        assertThat(compileCalls).hasValue(1);
        assertThat(scheduleCalls).hasValue(1);
    }

    @Test
    void aiCanSelectAnyExistingRentalCandidateInTheTrustedBundle() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                return new ScheduleResult(new EvidenceSelectionValidator.Selection(
                        "rental:station-2", List.of(new EvidenceSelectionValidator.StopSelection("poi:station-2:poi-1", 20)),
                        List.of("route:rental:station-2->poi:station-2:poi-1"), List.of("weather:station-2"),
                        List.of("air-quality:station-2"), List.of(), List.of(), "두 번째 대여 후보 선택",
                        List.of("EVIDENCE_ONLY")), null);
            }
        };
        JourneyRentalPredictionPort rentalPort = request -> List.of(
                rentalWithAccess(request, "station-1", "37.550", "127.050", "0.90"),
                rentalWithAccess(request, "station-2", "37.552", "127.052", "0.70"));
        JourneyPlanService service = new JourneyPlanService(new InMemoryPersistence(), ai, new CountingReturnPort(),
                rentalPort, completeEvidence(), new ObjectMapper().findAndRegisterModules());

        JourneyPlanService.Decision decision = planAndConfirm(service,
                unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));

        assertThat(decision.unifiedPlan().selectedRentalCandidateId()).isEqualTo("rental:station-2");
        assertThat(decision.unifiedPlan().evidence().rentalCandidates().keySet())
                .containsExactly("rental:station-1", "rental:station-2");
        assertThat(decision.unifiedPlan().segments().get(1).rentalFacts()).satisfies(facts -> {
            assertThat(facts.stationId()).isEqualTo("station-2");
            assertThat(facts.rentalProbability()).isEqualByComparingTo("0.70");
        });
    }

    @Test
    void mixedEnvironmentEvidenceRetainsTheBundleWithoutAdoptingTheInvalidSelection() {
        JourneyAiGateway ai = new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                return new ScheduleResult(new EvidenceSelectionValidator.Selection(
                        "rental:station-2", List.of(), List.of(), List.of("weather:station-1"),
                        List.of("air-quality:station-2"), List.of(), List.of(), "대여 후보 근거 선택",
                        List.of("EVIDENCE_ONLY")), null);
            }
        };
        JourneyRentalPredictionPort rentalPort = request -> List.of(
                rentalWithAccess(request, "station-1", "37.550", "127.050", "0.90"),
                rentalWithAccess(request, "station-2", "37.552", "127.052", "0.70"));
        JourneyPlanService service = new JourneyPlanService(new InMemoryPersistence(), ai, new CountingReturnPort(),
                rentalPort, completeEvidence(), new ObjectMapper().findAndRegisterModules());

        JourneyPlanService.Decision decision = planAndConfirm(service,
                unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));
        assertRejectedSchedule(decision);
        assertThat(decision.unifiedPlan().evidence().rentalCandidates()).containsOnlyKeys("rental:station-1", "rental:station-2");
        assertThat(decision.unifiedPlan().selectedRentalCandidateId()).isEqualTo("rental:station-1");
    }

    @Test
    void finalScheduleOutcomeSharesTheCallCorrelationAndRestoresMdcForSuccessAndFailure() {
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(JourneyPlanService.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        String previous = org.slf4j.MDC.get("journeyAiCorrelationId");
        try {
            for (boolean invalidEvidence : List.of(false, true)) {
                appender.list.clear();
                org.slf4j.MDC.put("journeyAiCorrelationId", "outer-correlation");
                java.util.concurrent.atomic.AtomicReference<String> callCorrelation = new java.util.concurrent.atomic.AtomicReference<>();
                JourneyAiGateway ai = new JourneyAiGateway() {
                    @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
                    @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                            List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
                    @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                        callCorrelation.set(org.slf4j.MDC.get("journeyAiCorrelationId"));
                        return new ScheduleResult(invalidEvidence ? new EvidenceSelectionValidator.Selection(
                                "invented-rental", List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                                "invalid provider rationale", List.of()) : validSelection(), null);
                    }
                };
                JourneyPlanService.Decision decision = planAndConfirm(unifiedService(new InMemoryPersistence(), ai,
                        new CountingReturnPort(), completeEvidence()), unifiedInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, "서울숲 카페 여정"));

                assertThat(callCorrelation.get()).isNotBlank().isNotEqualTo("outer-correlation");
                assertThat(org.slf4j.MDC.get("journeyAiCorrelationId")).isEqualTo("outer-correlation");
                List<String> messages = appender.list.stream().map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage).toList();
                assertThat(messages).hasSize(1);
                assertThat(messages.getFirst()).contains("kind=SCHEDULE_SELECTION", "correlation_id=" + callCorrelation.get(),
                        invalidEvidence ? "outcome=FAILURE" : "outcome=SUCCESS")
                        .doesNotContain("invalid provider rationale", "서울숲", "37.544", "127.056");
                if (invalidEvidence) {
                    assertThat(messages.getFirst()).contains("stage=EVIDENCE_VALIDATION", "code=AI_TOOL_VALUE_MISMATCH").doesNotContain("outcome=SUCCESS");
                    assertRejectedSchedule(decision);
                } else {
                    assertThat(decision.status()).isEqualTo(JourneyStatus.READY);
                }
            }
        } finally {
            logger.detachAppender(appender);
            appender.stop();
            if (previous == null) org.slf4j.MDC.remove("journeyAiCorrelationId");
            else org.slf4j.MDC.put("journeyAiCorrelationId", previous);
        }
    }

    @Test
    void exposesProviderEmptyErrorAndRouteUnavailabilityWithoutSyntheticStops() {
        JourneyPlanService.Decision empty = unifiedService(new InMemoryPersistence(), disabledAi(),
                new CountingReturnPort(), evidence(false, true, true)).plan(10L,
                unifiedInput(JourneyPlanService.RequestMode.FORM, null));
        JourneyPlanService.Decision error = unifiedService(new InMemoryPersistence(), disabledAi(),
                new CountingReturnPort(), evidence(true, true, true)).plan(10L,
                unifiedInput(JourneyPlanService.RequestMode.FORM, null));
        JourneyPlanService.Decision routeUnavailable = unifiedService(new InMemoryPersistence(), disabledAi(),
                new CountingReturnPort(), evidence(false, false, false)).plan(10L,
                unifiedInput(JourneyPlanService.RequestMode.FORM, null));
        JourneyPlanService.Decision routeError = unifiedService(new InMemoryPersistence(), disabledAi(),
                new CountingReturnPort(), evidence(false, false, false, true)).plan(10L,
                unifiedInput(JourneyPlanService.RequestMode.FORM, null));

        assertThat(empty.status()).isEqualTo(JourneyStatus.PARTIAL);
        assertThat(empty.warnings()).contains("POI_EMPTY:CAFE", "VISIT_PARTIAL");
        assertThat(error.status()).isEqualTo(JourneyStatus.PARTIAL);
        assertThat(error.warnings()).contains("POI_PROVIDER_UNAVAILABLE:CAFE", "VISIT_PARTIAL");
        assertThat(routeUnavailable.status()).isEqualTo(JourneyStatus.PARTIAL);
        assertThat(routeUnavailable.warnings()).anyMatch(value -> value.startsWith("BICYCLE_ROUTE_UNAVAILABLE:"));
        assertThat(routeUnavailable.warnings()).anyMatch(value -> value.startsWith("BICYCLE_ROUTE_EMPTY:"));
        assertThat(routeError.warnings()).anyMatch(value -> value.startsWith("BICYCLE_ROUTE_PROVIDER_ERROR:"));
        assertThat(routeUnavailable.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT);
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

    private JourneyPlanService unifiedService(InMemoryPersistence persistence, JourneyAiGateway ai,
                                               ReturnPredictionPort returnPort, JourneyEvidencePort evidencePort) {
        JourneyRentalPredictionPort rentalPort = request -> List.of(rentalWithAccess(request));
        return new JourneyPlanService(persistence, ai, returnPort, rentalPort, evidencePort,
                new ObjectMapper().findAndRegisterModules());
    }

    private JourneyPlanService.PlanInput unifiedInput(JourneyPlanService.RequestMode mode, String text) {
        OffsetDateTime departureAt = OffsetDateTime.parse("2030-09-02T10:00:00+09:00");
        return new JourneyPlanService.PlanInput(mode, text,
                new JourneyPlanService.Place("origin-1", "성수역", 37.544, 127.056),
                new JourneyPlanService.Place("destination-1", "서울숲", 37.545, 127.039),
                departureAt, 120, 2, Map.of(), List.of(), null,
                new JourneyPlanService.PlanConstraints(120, List.of("CAFE"), 1, "BIKE_ONLY"));
    }

    private JourneyRentalPredictionPort.RentalCandidate rentalWithAccess(
            JourneyRentalPredictionPort.RentalPredictionRequest request) {
        return rentalWithAccess(request, "station-1", "37.550", "127.050", "0.81");
    }

    private JourneyRentalPredictionPort.RentalCandidate rentalWithAccess(
            JourneyRentalPredictionPort.RentalPredictionRequest request,
            String stationId,
            String latitude,
            String longitude,
            String probability
    ) {
        OffsetDateTime featureAsOf = request.departureAt().minusHours(1);
        return new JourneyRentalPredictionPort.RentalCandidate(
                stationId, "서울숲 대여소", new BigDecimal(latitude), new BigDecimal(longitude),
                8, "NORMAL", featureAsOf, new BigDecimal(probability), request.requiredBikeCount(), "HIGH",
                500, 300, request.departureAt().plusSeconds(300), request.departureAt().plusMinutes(30),
                90L, featureAsOf, "model@1", featureAsOf.plusMinutes(5), "NORMAL", "NORMAL",
                new JourneyRentalPredictionPort.RouteEvidence(500, 300, "WALK", List.of(
                        new JourneyRentalPredictionPort.RoutePoint(request.originLatitude(), request.originLongitude()),
                        new JourneyRentalPredictionPort.RoutePoint(new BigDecimal(latitude), new BigDecimal(longitude)))));
    }

    private JourneyEvidencePort completeEvidence() {
        return evidence(false, true, false);
    }

    private JourneyEvidencePort evidence(boolean poiError, boolean routeAvailable, boolean poiEmpty) {
        return evidence(poiError, routeAvailable, poiEmpty, false);
    }

    private JourneyEvidencePort evidence(boolean poiError, boolean routeAvailable, boolean poiEmpty, boolean routeError) {
        return new JourneyEvidencePort() {
            @Override public List<PoiEvidence> findNearby(String stationId, String theme, int limit) {
                if (poiError) throw new IllegalStateException("provider down");
                if (poiEmpty) return List.of();
                return List.of(new PoiEvidence("poi-1", "서울숲 카페", "서울 성동구", "카페",
                        new BigDecimal("37.551"), new BigDecimal("127.041"), 700));
            }

            @Override public Optional<RouteEvidence> bicycleRoute(BigDecimal originLatitude, BigDecimal originLongitude,
                    BigDecimal destinationLatitude, BigDecimal destinationLongitude, String routeMode) {
                if (routeError) throw new IllegalStateException("route provider down");
                if (!routeAvailable) return Optional.empty();
                return Optional.of(new RouteEvidence(900, 300, "BICYCLE", routeMode, List.of(
                        new RoutePoint(originLatitude, originLongitude),
                        new RoutePoint(destinationLatitude, destinationLongitude))));
            }

            @Override public EnvironmentEvidence weather(BigDecimal latitude, BigDecimal longitude, OffsetDateTime arrivalAt) {
                return new EnvironmentEvidence("kma-short-forecast", "NORMAL", arrivalAt.minusMinutes(10),
                        Map.of("condition", "CLEAR"), Map.of("temperatureCelsius", new BigDecimal("22.5")));
            }

            @Override public EnvironmentEvidence airQuality(String stationId) {
                return new EnvironmentEvidence("air-korea", "NORMAL", OffsetDateTime.parse("2030-09-02T09:30:00+09:00"),
                        Map.of("grade", "GOOD"), Map.of("pm10", new BigDecimal("18")));
            }
        };
    }

    private JourneyIntent validIntent() {
        return new JourneyIntent(new PlaceReference("성수역", "origin-1"), new PlaceReference("서울숲", "destination-1"),
                OffsetDateTime.parse("2030-09-02T10:00:00+09:00"), 120, 2,
                Map.of("cafe", 3), Map.of("theme", "CAFE", "stopCount", 1), List.of(), false);
    }

    private EvidenceSelectionValidator.Selection validSelection() {
        return new EvidenceSelectionValidator.Selection(
                "rental:station-1", List.of(new EvidenceSelectionValidator.StopSelection("poi:station-1:poi-1", 20)),
                List.of("route:rental:station-1->poi:station-1:poi-1"), List.of("weather:station-1"),
                List.of("air-quality:station-1"), List.of(), List.of(), "근거 기반 카페 경유",
                List.of("EVIDENCE_ONLY"));
    }

    private void assertRejectedSchedule(JourneyPlanService.Decision decision) {
        assertThat(decision.status()).isEqualTo(JourneyStatus.UNAVAILABLE);
        assertThat(decision.warnings()).contains("AI_TOOL_VALUE_MISMATCH");
        assertThat(decision.normalizedIntent().path("aiIntent").isObject()).isTrue();
        assertThat(decision.unifiedPlan().segments()).extracting(UnifiedJourneyPlan.Segment::type)
                .containsExactly(UnifiedJourneyPlan.SegmentType.ACCESS, UnifiedJourneyPlan.SegmentType.RENT);
        assertThat(decision.unifiedPlan().rationale()).isNull();
    }

    private JourneyPlanService.Decision planAndConfirm(JourneyPlanService service, JourneyPlanService.PlanInput initial) {
        JourneyPlanService.Decision first = service.plan(10L, initial);
        JourneyPlanService.PlanInput confirmed = new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.FORM, null,
                initial.origin(), initial.destination(), initial.departureAt(), initial.maxJourneyMinutes(), initial.requiredBikeCount(),
                initial.preferences(), initial.avoid(), first.revision(), initial.constraints());
        return service.replan(10L, first.decisionId(), confirmed);
    }

    private JourneyAiGateway availableAi() {
        return new JourneyAiGateway() {
            @Override public IntentResult compileIntent(String input) { return new IntentResult(validIntent(), null); }
            @Override public List<com.ddarungflow.journey.ai.ToolCallRequest> validateToolPlan(
                    List<com.ddarungflow.journey.ai.ToolCallRequest> requests) { return requests; }
            @Override public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
                return new ScheduleResult(validSelection(), null);
            }
        };
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

    private JourneyPlanService.PlanInput textOnlyInput(String text) {
        return new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.NATURAL_LANGUAGE, text,
                null, null, null, null, null, Map.of(), List.of(), null);
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
