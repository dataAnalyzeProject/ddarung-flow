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
    void safeOffPlanPersistsRevisionOneWithoutNaturalLanguageOrFixtureCandidates() {
        InMemoryPersistence persistence = new InMemoryPersistence();
        CountingReturnPort returnPort = new CountingReturnPort();
        JourneyPlanService service = service(persistence, disabledAi(), returnPort);

        JourneyPlanService.Decision decision = service.plan(10L, formInput());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.UNAVAILABLE);
        assertThat(decision.revision()).isEqualTo(1);
        assertThat(decision.candidates()).isEmpty();
        assertThat(decision.warnings()).containsExactly("JOURNEY_PROVIDER_UNAVAILABLE");
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
    void disabledNaturalLanguageUsesSafeFallback() {
        JourneyPlanService service = service(new InMemoryPersistence(), disabledAi(), new CountingReturnPort());

        JourneyPlanService.Decision decision = service.plan(10L, naturalLanguageInput());

        assertThat(decision.status()).isEqualTo(com.ddarungflow.journey.domain.JourneyStatus.UNAVAILABLE);
        assertThat(decision.warnings()).containsExactly("AI_PROVIDER_UNAVAILABLE");
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
        assertThat(piiDecision.warnings()).containsExactly("AI_PII_BLOCKED").noneMatch(warning -> warning.contains("secret"));

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
        return new JourneyPlanService(persistence, ai, returnPort, new ObjectMapper().findAndRegisterModules());
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
                    decision.normalizedIntentJson(), decision.contractVersions(), decision.generatedAt(), decision.expiresAt(), List.of());
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
