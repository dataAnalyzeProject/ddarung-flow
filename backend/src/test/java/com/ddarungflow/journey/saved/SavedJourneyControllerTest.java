package com.ddarungflow.journey.saved;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.EvidenceSelectionValidator;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.application.JourneyEvidencePort;
import com.ddarungflow.journey.application.JourneyRentalPredictionPort;
import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.payment.Subscription;
import com.ddarungflow.payment.SubscriptionPlan;
import com.ddarungflow.payment.SubscriptionRepository;
import com.ddarungflow.repository.UsersRepository;
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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
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
    @Autowired private SavedJourneyIdempotencyKeyRepository idempotencyKeys;
    @Autowired private UsersRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @MockitoBean private JourneyRentalPredictionPort rentalPrediction;
    @MockitoBean private JourneyEvidencePort evidence;
    @MockitoBean private JourneyAiGateway aiGateway;
    @MockitoBean private KakaoMapClient places;

    private UsernamePasswordAuthenticationToken userA;
    private UsernamePasswordAuthenticationToken userB;

    @BeforeEach
    void setUp() {
        idempotencyKeys.deleteAll();
        savedJourneys.deleteAll();
        subscriptions.deleteAll();
        users.deleteAll();
        reset(rentalPrediction, evidence, aiGateway, places);
        when(rentalPrediction.predict(any())).thenAnswer(invocation -> {
            JourneyRentalPredictionPort.RentalPredictionRequest request = invocation.getArgument(0);
            return List.of(rentalCandidate(request.departureAt(), request.requiredBikeCount()));
        });
        when(evidence.available()).thenReturn(true);
        when(evidence.findNearbyAt(any(), any(), anyString(), anyInt())).thenReturn(List.of(poi()));
        when(evidence.bicycleRoute(any(), any(), any(), any(), anyString())).thenReturn(Optional.of(bicycleRoute()));
        when(evidence.weather(any(), any(), any())).thenReturn(environment("weather"));
        when(evidence.airQuality(anyString())).thenReturn(environment("air-quality"));
        when(aiGateway.selectSchedule(any(ConsumerAiEvidenceBundle.class), any(JourneyAiGateway.ScheduleConstraints.class)))
                .thenReturn(new JourneyAiGateway.ScheduleResult(selection(), null));
        userA = loginAuthentication("saved-a");
        userB = loginAuthentication("saved-b");
    }

    @Test
    void replayRequiresPremiumBeforeAnyCurrentEvidenceCall() throws Exception {
        String savedId = savedJourneyId(save("replay-free", VALID_INPUT));

        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));

        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PREMIUM_REQUIRED"));

        verifyNoInteractions(rentalPrediction);
        verifyNoInteractions(places);
        verify(aiGateway, never()).selectSchedule(any(), any());
    }

    @Test
    void replayRejectsExpiredPremiumBeforeAnyCurrentEvidenceCall() throws Exception {
        String savedId = savedJourneyId(save("replay-expired", VALID_INPUT));
        subscriptions.save(new Subscription(((PrincipalDetails) userA.getPrincipal()).getUsers(),
                SubscriptionPlan.PREMIUM_MONTHLY_30D, OffsetDateTime.now().minusDays(31)));

        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PREMIUM_REQUIRED"));

        verifyNoInteractions(rentalPrediction, places);
        verify(aiGateway, never()).selectSchedule(any(), any());
    }

    @Test
    void replayUsesStoredConditionsAndFetchesFreshEvidenceForEveryNewDecision() throws Exception {
        activatePremium(userA);
        String savedId = savedJourneyId(save("replay-active", VALID_INPUT));
        String request = """
                {"departureAt":"2030-09-02T10:00:00+09:00","requiredBikeCount":3,
                 "availableMinutes":50,"maxJourneyMinutes":50,"preferences":{"quiet":"HIGH"},
                 "themes":["CAFE"],"stopCount":1,"routeMode":"BIKE_ONLY"}
                """;

        String firstReplay = mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andExpect(jsonPath("$.decisionId").isNotEmpty())
                .andExpect(jsonPath("$.normalizedIntent.requestMode").value("FORM"))
                .andExpect(jsonPath("$.normalizedIntent.plannerMode").value("NATURAL_LANGUAGE"))
                .andExpect(jsonPath("$.normalizedIntent.requiredBikeCount").value(3))
                .andExpect(jsonPath("$.normalizedIntent.preferences.lowSlope").value("HIGH"))
                .andExpect(jsonPath("$.normalizedIntent.preferences.quiet").value("HIGH"))
                .andReturn().getResponse().getContentAsString();
        String secondReplay = mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andExpect(jsonPath("$.decisionId").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        verify(rentalPrediction, times(2)).predict(any());
        // Stops follow the stored destination now, not the station the replay rents at.
        verify(evidence, times(2)).findNearbyAt(new java.math.BigDecimal("37.544"), new java.math.BigDecimal("127.037"),
                "CAFE", 1);
        verify(evidence, never()).findNearby(anyString(), anyString(), anyInt());
        verify(evidence, times(2)).bicycleRoute(any(), any(), any(), any(), anyString());
        verify(evidence, times(2)).weather(any(), any(), any());
        verify(evidence, times(2)).airQuality("station-1");
        verify(aiGateway, times(2)).selectSchedule(any(), any());
        verify(aiGateway, never()).compileIntent(anyString());
        assertThat(decisionId(secondReplay)).isNotEqualTo(decisionId(firstReplay));
        assertThat(savedJourneys.findByUserIdAndPublicId(userAUserId(), savedId).orElseThrow()
                .getReplayInputJson()).contains("\"requiredBikeCount\":2").doesNotContain("quiet");
    }

    @Test
    void replayKeepsOwnershipHiddenAndRejectsFreeFormInput() throws Exception {
        activatePremium(userA);
        activatePremium(userB);
        String savedId = savedJourneyId(save("replay-owner", VALID_INPUT));

        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userB)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("JOURNEY_NOT_ACCESSIBLE"));
        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\",\"naturalLanguageText\":\"다시 계획해줘\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("JOURNEY_INTENT_INVALID"));

        verifyNoInteractions(rentalPrediction);
    }

    @Test
    void replayResolvesCoordinateLessStoredPlacesByExactProviderIdentity() throws Exception {
        activatePremium(userA);
        String withoutCoordinates = VALID_INPUT
                .replace(",\"latitude\":37.544,\"longitude\":127.056", "")
                .replace(",\"latitude\":37.544,\"longitude\":127.037", "");
        when(places.searchPlaces("성수역")).thenReturn(List.of(
                new com.ddarungflow.map.MapApiDtos.PlaceSearchResponseDto("origin-1", "성수역", "서울 성동구",
                        new BigDecimal("37.544"), new BigDecimal("127.056"))));
        when(places.searchPlaces("서울숲")).thenReturn(List.of(
                new com.ddarungflow.map.MapApiDtos.PlaceSearchResponseDto("destination-1", "서울숲", "서울 성동구",
                        new BigDecimal("37.544"), new BigDecimal("127.037"))));
        String savedId = savedJourneyId(save("replay-resolve", withoutCoordinates));

        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\",\"themes\":[\"CAFE\"],\"stopCount\":1}"))
                .andExpect(status().isOk());

        verify(places).searchPlaces("성수역");
        verify(places).searchPlaces("서울숲");
    }

    @Test
    void replayRejectsPastDepartureAndOutOfRangeStructuredOverrides() throws Exception {
        activatePremium(userA);
        String savedId = savedJourneyId(save("replay-invalid", VALID_INPUT));

        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2020-09-02T10:00:00+09:00\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("JOURNEY_INTENT_INVALID"));
        mvc.perform(post("/api/v1/saved-journeys/{id}/replay", savedId)
                        .with(authentication(userA)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureAt\":\"2030-09-02T10:00:00+09:00\",\"requiredBikeCount\":6}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("JOURNEY_INTENT_INVALID"));

        verifyNoInteractions(rentalPrediction);
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
        String first = save("retry-1", VALID_INPUT);
        String second = save("retry-1", VALID_INPUT);
        assertThat(savedJourneyId(second)).isEqualTo(savedJourneyId(first));
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf()).header("Idempotency-Key", "retry-1")
                        .contentType(MediaType.APPLICATION_JSON).content(withReplayVariant(2)))
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
    void differentKeysForTheSameReplayInputConvergeAndTheSecondKeyCannotChangeInput() throws Exception {
        String first = save("duplicate-1", VALID_INPUT);
        String second = save("duplicate-2", VALID_INPUT);
        assertThat(savedJourneyId(second)).isEqualTo(savedJourneyId(first));
        assertThat(savedJourneys.count()).isEqualTo(1);
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf()).header("Idempotency-Key", "duplicate-2")
                        .contentType(MediaType.APPLICATION_JSON).content(withReplayVariant(2)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
    }

    @Test
    void firstIdempotencyKeyCannotChangeInputAfterAnotherKeyReusedTheSavedJourney() throws Exception {
        String first = save("key-1", VALID_INPUT);
        String second = save("key-2", VALID_INPUT);
        assertThat(savedJourneyId(second)).isEqualTo(savedJourneyId(first));
        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf()).header("Idempotency-Key", "key-1")
                        .contentType(MediaType.APPLICATION_JSON).content(withReplayVariant(2)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
    }

    @Test
    void displayNameDoesNotChangeReplayDuplicateAndKeepsTheFirstName() throws Exception {
        String first = save("name-1", withDisplayName("주말 코스"));
        String second = save("name-2", withDisplayName("친구 코스"));
        assertThat(savedJourneyId(second)).isEqualTo(savedJourneyId(first));
        assertThat(savedJourneys.count()).isEqualTo(1);
        mvc.perform(get("/api/v1/saved-journeys").with(authentication(userA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].displayName").value("주말 코스"))
                .andExpect(jsonPath("$[0].replayInput.displayName").doesNotExist());
    }

    @Test
    void limitsEachUserToTenSavedJourneysWithoutDeletingExistingEntries() throws Exception {
        for (int index = 1; index <= 10; index++) {
            String input = withReplayVariant(index);
            mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                            .header("Idempotency-Key", "limit-" + index).contentType(MediaType.APPLICATION_JSON).content(input))
                    .andExpect(status().isOk());
        }

        mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", "limit-11").contentType(MediaType.APPLICATION_JSON)
                        .content(withReplayVariant(11)))
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
        assertThat(idempotencyKeys.count()).isEqualTo(1);
    }

    @Test
    void concurrentDifferentKeysForTheSameInputReturnWithoutServerErrorAndConverge() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            var first = executor.submit(() -> concurrentSave(start, "concurrent-a"));
            var second = executor.submit(() -> concurrentSave(start, "concurrent-b"));
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        }
        assertThat(savedJourneys.count()).isEqualTo(1);
        assertThat(idempotencyKeys.count()).isEqualTo(2);
    }

    @Test
    void deletingASavedJourneyRemovesItsIdempotencyRegistryKeys() throws Exception {
        String response = save("delete-registry-1", VALID_INPUT);
        save("delete-registry-2", VALID_INPUT);
        Long databaseId = savedJourneys.findByUserIdAndPublicId(userAUserId(), savedJourneyId(response)).orElseThrow().getId();
        assertThat(idempotencyKeys.countBySavedJourneyId(databaseId)).isEqualTo(2);

        mvc.perform(delete("/api/v1/saved-journeys/{id}", savedJourneyId(response)).with(authentication(userA)).with(csrf()))
                .andExpect(status().isNoContent());
        assertThat(idempotencyKeys.countBySavedJourneyId(databaseId)).isZero();
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
        return concurrentSave(start, "concurrent-1");
    }

    private int concurrentSave(CountDownLatch start, String key) throws Exception {
        start.await(10, TimeUnit.SECONDS);
        return mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(VALID_INPUT))
                .andReturn().getResponse().getStatus();
    }

    private String save(String key, String input) throws Exception {
        return mvc.perform(post("/api/v1/saved-journeys").with(authentication(userA)).with(csrf())
                        .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(input))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private String savedJourneyId(String response) throws Exception {
        JsonNode json = new ObjectMapper().readTree(response);
        return json.get("savedJourneyId").asText();
    }

    private Long userAUserId() {
        return ((PrincipalDetails) userA.getPrincipal()).getUsers().getId();
    }

    private String decisionId(String response) throws Exception {
        JsonNode json = new ObjectMapper().readTree(response);
        return json.get("decisionId").asText();
    }

    private void activatePremium(UsernamePasswordAuthenticationToken authentication) {
        subscriptions.save(new Subscription(((PrincipalDetails) authentication.getPrincipal()).getUsers(),
                SubscriptionPlan.PREMIUM_MONTHLY_30D, OffsetDateTime.now()));
    }

    private JourneyRentalPredictionPort.RentalCandidate rentalCandidate(OffsetDateTime departureAt, int requiredBikeCount) {
        OffsetDateTime sourceAt = OffsetDateTime.parse("2030-09-02T09:00:00+09:00");
        return new JourneyRentalPredictionPort.RentalCandidate("station-1", "서울숲역 대여소",
                new BigDecimal("37.55"), new BigDecimal("127.05"), 8, "NORMAL", sourceAt,
                new BigDecimal("0.81"), requiredBikeCount, "HIGH", 500, 300, departureAt.plusSeconds(300),
                sourceAt.plusHours(1), 60L, sourceAt, "model@1", sourceAt, "NORMAL", "NORMAL",
                new JourneyRentalPredictionPort.RouteEvidence(500, 300, "WALK", List.of(
                        new JourneyRentalPredictionPort.RoutePoint(new BigDecimal("37.544"), new BigDecimal("127.056")),
                        new JourneyRentalPredictionPort.RoutePoint(new BigDecimal("37.55"), new BigDecimal("127.05")))));
    }

    private JourneyEvidencePort.PoiEvidence poi() {
        return new JourneyEvidencePort.PoiEvidence("poi-1", "서울숲 카페", "서울 성동구", "카페",
                new BigDecimal("37.551"), new BigDecimal("127.041"), 700);
    }

    private JourneyEvidencePort.RouteEvidence bicycleRoute() {
        return new JourneyEvidencePort.RouteEvidence(900, 300, "BICYCLE", "BIKE_ONLY", List.of(
                new JourneyEvidencePort.RoutePoint(new BigDecimal("37.55"), new BigDecimal("127.05")),
                new JourneyEvidencePort.RoutePoint(new BigDecimal("37.551"), new BigDecimal("127.041"))));
    }

    private JourneyEvidencePort.EnvironmentEvidence environment(String source) {
        return new JourneyEvidencePort.EnvironmentEvidence(source, "NORMAL",
                OffsetDateTime.parse("2030-09-02T09:30:00+09:00"), Map.of("status", "NORMAL"), Map.of());
    }

    private EvidenceSelectionValidator.Selection selection() {
        return new EvidenceSelectionValidator.Selection("rental:station-1",
                List.of(new EvidenceSelectionValidator.StopSelection("poi:station-1:poi-1", 20)),
                List.of("route:rental:station-1->poi:station-1:poi-1"), List.of("weather:station-1"),
                List.of("air-quality:station-1"), List.of(), List.of(), "현재 근거 기반 재계획",
                List.of("EVIDENCE_ONLY"));
    }

    private String withDisplayName(String name) {
        return VALID_INPUT.replaceFirst("\\{", "{\"displayName\":\"" + name + "\",");
    }

    private String withReplayVariant(int index) {
        return VALID_INPUT.replace("\"origin-1\"", "\"origin-" + index + "\"")
                .replace("\"성수역\"", "\"성수역 " + index + "\"");
    }
}
