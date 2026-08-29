package com.ddarungflow.journey.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.ai.JourneyAiProperties;
import com.ddarungflow.journey.ai.JourneyAiFailureStage;
import com.ddarungflow.journey.persistence.JourneyCandidateRepository;
import com.ddarungflow.journey.persistence.JourneyDecisionRepository;
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
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
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

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UsersRepository users;
    @Autowired private JourneyDecisionRepository decisions;
    @Autowired private JourneyCandidateRepository candidates;
    @Autowired private JourneyAiProperties aiProperties;

    private UsernamePasswordAuthenticationToken userA;
    private UsernamePasswordAuthenticationToken userB;

    @BeforeEach
    void setUp() {
        candidates.deleteAll();
        decisions.deleteAll();
        users.deleteAll();
        userA = login("journey-a");
        userB = login("journey-b");
    }

    @Test
    void safeOffApplicationStartsAndAuthenticatedPlanPersistsAnUnavailableRevision() throws Exception {
        assertThat(aiProperties.enabled()).isFalse();
        assertThat(aiProperties.responsesUri().toString()).isEqualTo("https://example.test/responses");
        assertThat(aiProperties.apiKey()).isEqualTo("test-api-key");
        assertThat(aiProperties.model()).isEqualTo("test-journey-model");
        String response = mvc.perform(post("/api/v1/journeys/plan").with(authentication(userA)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.status").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.candidates").isEmpty())
                .andExpect(jsonPath("$.warnings[0]").value("JOURNEY_PROVIDER_UNAVAILABLE"))
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
        return ((PrincipalDetails) authentication.getPrincipal()).getUsers().getId();
    }
}
