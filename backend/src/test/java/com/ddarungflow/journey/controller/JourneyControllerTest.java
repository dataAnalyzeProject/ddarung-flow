package com.ddarungflow.journey.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.ai.JourneyAiProperties;
import com.ddarungflow.journey.ai.JourneyAiFailureStage;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyCompileRequest;
import com.ddarungflow.journey.ai.JourneyIntent;
import com.ddarungflow.journey.ai.PlaceReference;
import com.ddarungflow.journey.persistence.JourneyCandidateRepository;
import com.ddarungflow.journey.persistence.JourneyDecisionRepository;
import com.ddarungflow.payment.Subscription;
import com.ddarungflow.payment.SubscriptionPlan;
import com.ddarungflow.payment.SubscriptionRepository;
import com.ddarungflow.repository.UsersRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "journey.ai.enabled=false",
        "JOURNEY_AI_RESPONSES_URI=https://example.test/responses",
        "JOURNEY_AI_API_KEY=test-api-key",
        "JOURNEY_AI_MODEL=test-journey-model",
        "journey.return-prediction.enabled=false",
        "journey.phase-a-fixture-enabled=false"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JourneyControllerTest {
    private static final String PLAN = """
            {"requestMode":"FORM","origin":{"placeId":"origin-1","displayName":"성수역","latitude":37.544,"longitude":127.056},
             "destination":null,"departureAt":"2030-08-28T18:00:00+09:00","maxJourneyMinutes":60,"requiredBikeCount":2,
             "preferences":{"lowSlope":"HIGH"},"avoid":["RAIN"]}
            """;
    private static final String AI_PLAN = """
            {"requestMode":"NATURAL_LANGUAGE","naturalLanguageText":"성수역에서 서울숲으로 가는 여정을 계획해 줘",
             "origin":{"placeId":"origin-1","displayName":"성수역","latitude":37.544,"longitude":127.056},
             "destination":{"placeId":"destination-1","displayName":"서울숲","latitude":37.545,"longitude":127.039},
             "departureAt":"2030-08-28T18:00:00+09:00","maxJourneyMinutes":60,"requiredBikeCount":2,
             "preferences":{"lowSlope":"HIGH"},"avoid":["RAIN"]}
            """;
    private static final String AI_TEXT_ONLY = """
            {"requestMode":"NATURAL_LANGUAGE","naturalLanguageText":"서울숲에서 한 시간 자전거 타고 싶어"}
            """;

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UsersRepository users;
    @Autowired private JourneyDecisionRepository decisions;
    @Autowired private JourneyCandidateRepository candidates;
    @Autowired private JourneyAiProperties aiProperties;
    @Autowired private SubscriptionRepository subscriptions;
    @MockitoBean private JourneyAiGateway aiGateway;

    private UsernamePasswordAuthenticationToken userA;
    private UsernamePasswordAuthenticationToken userB;

    @BeforeEach
    void setUp() {
        candidates.deleteAll();
        decisions.deleteAll();
        subscriptions.deleteAll();
        users.deleteAll();
        reset(aiGateway);
        when(aiGateway.compileIntent(any(JourneyCompileRequest.class)))
                .thenReturn(JourneyAiGateway.IntentResult.unavailable(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE));
        userA = login("journey-a");
        userB = login("journey-b");
    }

    @Test
    void distinguishesAnonymousFromFreePremiumAiRequestsBeforeCallingTheProvider() throws Exception {
        for (String request : List.of(AI_PLAN, AI_TEXT_ONLY)) {
            mvc.perform(post("/api/v1/journeys/plan").with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));

            mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PREMIUM_REQUIRED"));
        }

        verifyNoInteractions(aiGateway);
    }

    @Test
    void expiredPremiumAiRequestDoesNotCallTheProvider() throws Exception {
        subscriptions.save(new Subscription(authenticatedUser(userA), SubscriptionPlan.PREMIUM_MONTHLY_30D,
                java.time.OffsetDateTime.now().minusDays(31)));

        for (String request : List.of(AI_PLAN, AI_TEXT_ONLY)) {
            mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PREMIUM_REQUIRED"));
        }

        verifyNoInteractions(aiGateway);
    }

    @Test
    void activePremiumAiRequestCallsTheProvider() throws Exception {
        subscriptions.save(new Subscription(authenticatedUser(userA), SubscriptionPlan.PREMIUM_MONTHLY_30D,
                java.time.OffsetDateTime.now()));

        mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(AI_PLAN))
                .andExpect(status().isOk());

        verify(aiGateway).compileIntent(any(JourneyCompileRequest.class));
    }

    @Test
    void activePremiumTextOnlyCompilesDraftWithoutFactualPlanning() throws Exception {
        subscriptions.save(new Subscription(authenticatedUser(userA), SubscriptionPlan.PREMIUM_MONTHLY_30D,
                java.time.OffsetDateTime.now()));
        when(aiGateway.compileIntent(any(JourneyCompileRequest.class)))
                .thenReturn(new JourneyAiGateway.IntentResult(new JourneyIntent(null, new PlaceReference("서울숲", "model-id"),
                        null, 60, 1, Map.of(), Map.of(), List.of("origin", "startAt"), true), null));

        mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(AI_TEXT_ONLY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLARIFICATION_REQUIRED"))
                .andExpect(jsonPath("$.candidates").isEmpty())
                .andExpect(jsonPath("$.normalizedIntent.origin").isEmpty())
                .andExpect(jsonPath("$.normalizedIntent.destination").isEmpty())
                .andExpect(jsonPath("$.normalizedIntent.plannerMode").value("NATURAL_LANGUAGE"))
                .andExpect(jsonPath("$.normalizedIntent.aiIntent.destination.displayName").value("서울숲"))
                .andExpect(jsonPath("$.normalizedIntent.aiIntent.destination.placeId").value(""))
                .andExpect(jsonPath("$.clarification.missingFields", org.hamcrest.Matchers.hasItems(
                        "origin", "destination", "departureAt", "maxJourneyMinutes", "requiredBikeCount")));

        verify(aiGateway).compileIntent(any(JourneyCompileRequest.class));
    }

    @Test
    void invalidTextOrOptionalContextIsRejectedBeforeProviderCalls() throws Exception {
        for (String text : List.of("", "   ", "가".repeat(501))) {
            assertInvalid(objectMapper.writeValueAsString(Map.of("requestMode", "NATURAL_LANGUAGE", "naturalLanguageText", text)));
        }
        assertInvalid("{\"requestMode\":\"NATURAL_LANGUAGE\"}");
        assertInvalid(AI_TEXT_ONLY.trim().replaceFirst("\\}$", ",\"requiredBikeCount\":6}"));
        assertInvalid(AI_TEXT_ONLY.trim().replaceFirst("\\}$", ",\"maxJourneyMinutes\":0}"));
        assertInvalid(AI_TEXT_ONLY.trim().replaceFirst("\\}$", ",\"origin\":{\"placeId\":\"model-place\",\"displayName\":\"서울숲\"}}"));
        verifyNoInteractions(aiGateway);
    }

    @Test
    void replanRejectsNaturalLanguageBeforePremiumOrProviderChecks() throws Exception {
        String decisionId = plan();
        String replan = AI_PLAN.trim().replaceFirst("\\}$", ",\"expectedRevision\":1}");

        mvc.perform(post("/api/v1/journeys/{id}/replan", decisionId).with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(replan))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("JOURNEY_INTENT_INVALID"));

        verifyNoInteractions(aiGateway);
    }

    @Test
    void formRequestRemainsAvailableWithoutPremium() throws Exception {
        mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk());

        verifyNoInteractions(aiGateway);
    }

    @Test
    void naturalLanguageWithoutDestinationRequiresPremiumBeforeCompile() throws Exception {
        String clarification = PLAN.replace("\"requestMode\":\"FORM\",",
                "\"requestMode\":\"NATURAL_LANGUAGE\",\"naturalLanguageText\":\"목적지를 정하지 못했어\",");

        mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(clarification))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PREMIUM_REQUIRED"));

        verifyNoInteractions(aiGateway);
    }

    @Test
    void missingDestinationPersistsAClarificationRevisionWithoutCandidates() throws Exception {
        assertThat(aiProperties.enabled()).isFalse();
        assertThat(aiProperties.responsesUri().toString()).isEqualTo("https://example.test/responses");
        assertThat(aiProperties.apiKey()).isEqualTo("test-api-key");
        assertThat(aiProperties.model()).isEqualTo("test-journey-model");
        String response = mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.status").value("CLARIFICATION_REQUIRED"))
                .andExpect(jsonPath("$.candidates").isEmpty())
                .andExpect(jsonPath("$.warnings[0]").value("CLARIFICATION_REQUIRED"))
                .andExpect(jsonPath("$.clarification.missingFields[0]").value("destination"))
                .andReturn().getResponse().getContentAsString();

        String decisionId = objectMapper.readTree(response).path("decisionId").asText();
        assertThat(decisions.findFirstByPublicIdAndUserIdOrderByRevisionDesc(decisionId, userId(userA))).isPresent();
    }

    @Test
    void decisionsAreUserIsolatedAndReplanKeepsThePublicId() throws Exception {
        String decisionId = plan();

        mvc.perform(get("/api/v1/journeys/{id}", decisionId).with(authentication(userB)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("JOURNEY_NOT_ACCESSIBLE"));

        String replan = PLAN.trim().replaceFirst("\\}$", ",\"expectedRevision\":1}");
        mvc.perform(post("/api/v1/journeys/{id}/replan", decisionId).with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(replan))
                .andExpect(status().isOk()).andExpect(jsonPath("$.decisionId").value(decisionId))
                .andExpect(jsonPath("$.revision").value(2));

        mvc.perform(post("/api/v1/journeys/{id}/replan", decisionId).with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(replan))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOURNEY_REVISION_CONFLICT"));
    }

    @Test
    void counterfactualDoesNotInventTheRemovedHardcodedSentence() throws Exception {
        String decisionId = plan();

        mvc.perform(post("/api/v1/journeys/{id}/counterfactuals", decisionId).with(authentication(userA)).with(csrf()))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("JOURNEY_NO_VALID_CANDIDATE"));
    }

    @Test
    void rejectsInvalidPublicPlanInputOnTheServer() throws Exception {
        assertInvalid(PLAN.replace("\"origin-1\"", "\"\""));
        assertInvalid(PLAN.replace("\"latitude\":37.544", "\"latitude\":null"));
        assertInvalid(PLAN.replace("\"latitude\":37.544", "\"latitude\":91"));
        assertInvalid(PLAN.replace("\"longitude\":127.056", "\"longitude\":181"));
        assertInvalid(PLAN.replace("\"destination\":null", "\"destination\":{\"placeId\":\"destination-1\",\"displayName\":\"\",\"latitude\":37.5,\"longitude\":127.0}"));
        assertInvalid(PLAN.replace("2030-08-28T18:00:00+09:00", "2000-08-28T18:00:00+09:00"));
    }

    @Test
    void mapsTypedAiErrorsWithoutExposingProviderMessages() {
        JourneyController controller = new JourneyController(null);

        JourneyPlanService.AiOutputSchemaInvalid exception = new JourneyPlanService.AiOutputSchemaInvalid(JourneyAiFailureStage.OUTPUT_TEXT_JSON);
        assertThat(controller.aiOutputSchemaInvalid(exception).getStatusCode().value()).isEqualTo(502);
        assertThat(controller.aiOutputSchemaInvalid(exception).getBody()).containsEntry("code", "AI_OUTPUT_SCHEMA_INVALID")
                .doesNotContainKey("stage").doesNotContainValue("provider raw output");
        assertThat(controller.aiToolValueMismatch().getStatusCode().value()).isEqualTo(500);
        assertThat(controller.aiToolValueMismatch().getBody()).containsEntry("code", "AI_TOOL_VALUE_MISMATCH").doesNotContainValue("provider raw output");
        assertThat(controller.premiumRequired().getStatusCode().value()).isEqualTo(403);
        assertThat(controller.premiumRequired().getBody()).containsEntry("code", "PREMIUM_REQUIRED");
        assertThat(controller.entitlementUnavailable().getStatusCode().value()).isEqualTo(503);
        assertThat(controller.entitlementUnavailable().getBody()).containsEntry("code", "PREMIUM_ENTITLEMENT_UNAVAILABLE");
    }

    @Test
    void usesUnknownSafeDiagnosticsWhenTheFailureStageIsAbsent() {
        JourneyController controller = new JourneyController(null);

        assertThat(controller.aiOutputSchemaInvalid(new JourneyPlanService.AiOutputSchemaInvalid(null)).getStatusCode().value()).isEqualTo(502);
        assertThat(controller.aiOutputSchemaInvalid(new JourneyPlanService.AiOutputSchemaInvalid(null)).getBody())
                .containsEntry("code", "AI_OUTPUT_SCHEMA_INVALID").doesNotContainKey("stage");
    }

    private void assertInvalid(String input) throws Exception {
        mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(input))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("JOURNEY_INTENT_INVALID"));
    }

    private String plan() throws Exception {
        String response = mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return json.path("decisionId").asText();
    }

    private UsernamePasswordAuthenticationToken login(String providerUserId) {
        Users user = users.save(Users.builder().provider("google").providerUserId(providerUserId).displayName(providerUserId).build());
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private Long userId(UsernamePasswordAuthenticationToken authentication) {
        return authenticatedUser(authentication).getId();
    }

    private Users authenticatedUser(UsernamePasswordAuthenticationToken authentication) {
        return ((PrincipalDetails) authentication.getPrincipal()).getUsers();
    }
}
