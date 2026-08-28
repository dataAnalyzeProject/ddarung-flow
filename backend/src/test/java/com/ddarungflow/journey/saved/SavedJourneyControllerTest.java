package com.ddarungflow.journey.saved;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SavedJourneyControllerTest {

    private static final String VALID_INPUT = """
            {"origin":{"providerId":"origin-1","displayName":"성수역","latitude":37.544,"longitude":127.056},
             "destination":{"providerId":"destination-1","displayName":"서울숲","latitude":37.544,"longitude":127.037},
             "requiredBikeCount":2,"totalJourneyMinutes":60,"maxJourneyMinutes":45,
             "preferences":{"lowSlope":"HIGH"},"hardConstraints":["RAIN"]}
            """;

    @Autowired private MockMvc mvc;
    @Autowired private SavedJourneyRepository savedJourneys;
    @Autowired private UsersRepository users;

    private UsernamePasswordAuthenticationToken userA;
    private UsernamePasswordAuthenticationToken userB;

    @BeforeEach
    void setUp() {
        savedJourneys.deleteAll();
        users.deleteAll();
        userA = loginAuthentication("saved-a");
        userB = loginAuthentication("saved-b");
    }

    @Test
    void anonymousRequestReturnsTheExistingAuthRequiredContract() throws Exception {
        mvc.perform(get("/api/v1/saved-journeys"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void createsListsAndKeepsSavedJourneysIsolatedByUser() throws Exception {
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "save-a-1").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.savedJourneyId").isNotEmpty())
                .andExpect(jsonPath("$.replayInput.origin.providerId").value("origin-1"));

        mvc.perform(get("/api/v1/saved-journeys").with(authentication(userA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(get("/api/v1/saved-journeys").with(authentication(userB)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void hidesAnotherUsersSavedJourneyAndReturns204ForOwnerDelete() throws Exception {
        String response = mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "delete-a-1").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getContentAsString();
        String id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response).get("savedJourneyId").asText();

        mvc.perform(delete("/api/v1/saved-journeys/{id}", id).with(authentication(userB)).with(csrf()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("JOURNEY_NOT_ACCESSIBLE"));
        mvc.perform(delete("/api/v1/saved-journeys/{id}", id).with(authentication(userA)).with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void returnsExistingResultForSameKeyAndRejectsDifferentPayload() throws Exception {
        String first = mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "retry-1").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "retry-1").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getContentAsString();

        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(second).get("savedJourneyId").asText())
                .isEqualTo(new com.fasterxml.jackson.databind.ObjectMapper().readTree(first).get("savedJourneyId").asText());
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf()).header("Idempotency-Key", "retry-1")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT.replace("\"requiredBikeCount\":2", "\"requiredBikeCount\":3")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
    }

    @Test
    void storesListsAndReturnsReplayInputWithANullDestination() throws Exception {
        String nullDestination = VALID_INPUT.replace("\"destination\":{\"providerId\":\"destination-1\",\"displayName\":\"서울숲\",\"latitude\":37.544,\"longitude\":127.037}", "\"destination\":null");

        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "null-destination").contentType(MediaType.APPLICATION_JSON).content(nullDestination))
                .andExpect(status().isOk()).andExpect(jsonPath("$.replayInput.destination").value(nullValue()));
        mvc.perform(get("/api/v1/saved-journeys").with(authentication(userA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].replayInput.destination").value(nullValue()));
    }

    @Test
    void returnsTheExistingSavedJourneyForTheSameReplayInputAndAnotherKey() throws Exception {
        String first = mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "duplicate-1").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "duplicate-2").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getContentAsString();

        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(second).get("savedJourneyId").asText())
                .isEqualTo(new com.fasterxml.jackson.databind.ObjectMapper().readTree(first).get("savedJourneyId").asText());
        assertThat(savedJourneys.count()).isEqualTo(1);
    }

    @Test
    void limitsEachUserToTenSavedJourneysWithoutDeletingExistingEntries() throws Exception {
        for (int index = 1; index <= 10; index++) {
            String input = withDisplayName(index);
            mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                            .header("Idempotency-Key", "limit-" + index).contentType(MediaType.APPLICATION_JSON).content(input))
                    .andExpect(status().isOk());
        }

        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "limit-11").contentType(MediaType.APPLICATION_JSON)
                        .content(withDisplayName(11)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SAVED_ROUTE_LIMIT_REACHED"));
        assertThat(savedJourneys.count()).isEqualTo(10);
    }

    @Test
    void concurrentRequestsWithTheSameIdempotencyKeyReturnWithoutServerError() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            var first = executor.submit(() -> concurrentSave(start));
            var second = executor.submit(() -> concurrentSave(start));
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        }
        assertThat(savedJourneys.count()).isEqualTo(1);
    }

    @Test
    void rejectsInvalidRequiredBikeCount() throws Exception {
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf()).header("Idempotency-Key", "invalid-1")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT.replace("\"requiredBikeCount\":2", "\"requiredBikeCount\":0")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("JOURNEY_INTENT_INVALID"));
    }

    @Test
    void retainsTheExistingCsrfRequirementForWrites() throws Exception {
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).header("Idempotency-Key", "csrf-1")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andExpect(status().isForbidden());
    }

    private UsernamePasswordAuthenticationToken loginAuthentication(String suffix) {
        Users user = users.save(Users.builder().provider("google").providerUserId(suffix).displayName(suffix).build());
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private int concurrentSave(CountDownLatch start) throws Exception {
        start.await(10, TimeUnit.SECONDS);
        return mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "concurrent-1").contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getStatus();
    }

    private String withDisplayName(int index) {
        return VALID_INPUT.replaceFirst("\\{", "{\"displayName\":\"saved-" + index + "\",");
    }
}
