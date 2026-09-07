package com.ddarungflow.notification;

import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.application.JourneyEvidencePort;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.application.JourneyRentalPredictionPort;
import com.ddarungflow.journey.persistence.JourneyDecisionRepository;
import com.ddarungflow.journey.saved.SavedJourneyDtos;
import com.ddarungflow.journey.saved.SavedJourneyIdempotencyKeyRepository;
import com.ddarungflow.journey.saved.SavedJourneyRepository;
import com.ddarungflow.journey.saved.SavedJourneyService;
import com.ddarungflow.payment.Subscription;
import com.ddarungflow.payment.SubscriptionPlan;
import com.ddarungflow.payment.SubscriptionRepository;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

/**
 * The recheck "현재 정보 다시 확인" action is the second entry point into the saved-journey replay
 * pipeline. RecheckSubscriptionService is annotated @Transactional(readOnly = true) at class level and
 * execute() declares no transaction of its own, so before TASK-361 the new Journey decision INSERT ran
 * inside a read-only transaction and PostgreSQL rejected it with SQLSTATE 25006.
 *
 * RecheckSubscriptionServiceTest cannot cover this: it is a plain Mockito unit test where
 * SavedJourneyService is a mock and no Spring proxy or transaction exists at all. This test uses the
 * real container so the transaction boundaries are the ones production uses.
 */
@SpringBootTest
@ActiveProfiles("test")
class RecheckSubscriptionTransactionTest {

    @Autowired private RecheckSubscriptionService rechecks;
    @Autowired private RecheckSubscriptionRepository subscriptionRepository;
    @Autowired private SavedJourneyService savedJourneys;
    @Autowired private SavedJourneyRepository savedJourneyRepository;
    @Autowired private SavedJourneyIdempotencyKeyRepository savedJourneyIdempotencyKeys;
    @Autowired private JourneyDecisionRepository journeyDecisions;
    @Autowired private UsersRepository users;
    @Autowired private SubscriptionRepository subscriptions;

    @MockitoBean private JourneyRentalPredictionPort rentalPrediction;
    @MockitoBean private JourneyEvidencePort evidence;

    private Users user;

    @BeforeEach
    void setUp() {
        clean();
        user = users.save(Users.builder().provider("google").providerUserId("recheck-tx").displayName("recheck-tx").build());
        subscriptions.save(new Subscription(user, SubscriptionPlan.PREMIUM_MONTHLY_30D, OffsetDateTime.now()));
        when(evidence.available()).thenReturn(false);
    }

    @AfterEach
    void tearDown() {
        // Leave no rows behind: the subscription row this test creates references users, and other
        // suites delete users without clearing subscriptions first.
        clean();
    }

    @Test
    @DisplayName("recheck execute의 PLAN_RECHECK replay는 읽기 전용 트랜잭션 밖에서 새 decision을 저장한다")
    void planRecheckExecutionPersistsTheNewDecisionOutsideAReadOnlyTransaction() {
        // A fixed far-future departure, as the other journey tests use: H2 round-trips OffsetDateTime
        // through a bare timestamp and shifts it by the local offset, so a "now + an hour" value can
        // come back already in the past and trip the planner's future-departure validation.
        OffsetDateTime departureAt = OffsetDateTime.parse("2030-09-02T10:00:00+09:00");
        String savedJourneyId = savedJourney();
        deliveredPlanRecheck(savedJourneyId, departureAt);

        // The rental prediction runs in the same JourneyPlanService frame that afterwards persists the
        // decision, with no transaction boundary in between, so the state observed here is the state the
        // INSERT runs under. H2 ignores read-only connections, which is why only this assertion — and not
        // a successful write — can detect the defect in CI.
        AtomicReference<Boolean> readOnlyWhileReplaying = new AtomicReference<>();
        doAnswer(invocation -> {
            readOnlyWhileReplaying.set(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            JourneyRentalPredictionPort.RentalPredictionRequest request = invocation.getArgument(0);
            return List.of(rentalCandidate(request.departureAt(), request.requiredBikeCount()));
        }).when(rentalPrediction).predict(any());

        RecheckSubscriptionDtos.ExecutionResponse response = rechecks.execute(user, "plan-recheck-public");

        assertThat(response.kind()).isEqualTo("PLAN_RECHECK");
        assertThat(readOnlyWhileReplaying.get()).isFalse();
        JourneyPlanService.Decision decision = (JourneyPlanService.Decision) response.result();
        assertThat(journeyDecisions.findFirstByPublicIdAndUserIdOrderByRevisionDesc(
                decision.decisionId(), user.getId())).isPresent();
    }

    // Recheck subscriptions reference saved journeys, and subscriptions reference users, so the
    // deletes are ordered from the dependent rows outward.
    private void clean() {
        subscriptionRepository.deleteAll();
        savedJourneyIdempotencyKeys.deleteAll();
        savedJourneyRepository.deleteAll();
        subscriptions.deleteAll();
        users.deleteAll();
    }

    private String savedJourney() {
        SavedJourneyDtos.PlaceInput origin = new SavedJourneyDtos.PlaceInput("origin-1", "성수역",
                new BigDecimal("37.544"), new BigDecimal("127.056"));
        SavedJourneyDtos.PlaceInput destination = new SavedJourneyDtos.PlaceInput("destination-1", "서울숲",
                new BigDecimal("37.544"), new BigDecimal("127.037"));
        return savedJourneys.save(user.getId(), "recheck-tx-key",
                new SavedJourneyDtos.SaveRequest("성수역 → 서울숲", origin, destination, 2, 60, 45, null, null))
                .getPublicId();
    }

    private void deliveredPlanRecheck(String savedJourneyId, OffsetDateTime departureAt) {
        RecheckSubscription subscription = new RecheckSubscription("plan-recheck-public", user.getId(),
                RecheckSubscription.Kind.PLAN_RECHECK, savedJourneys.findOwned(user.getId(), savedJourneyId),
                null, departureAt, departureAt.minusMinutes(15), UUID.randomUUID().toString(), OffsetDateTime.now());
        subscription.markDelivered();
        subscriptionRepository.save(subscription);
    }

    private JourneyRentalPredictionPort.RentalCandidate rentalCandidate(OffsetDateTime departureAt, int requiredBikeCount) {
        OffsetDateTime sourceAt = OffsetDateTime.now().minusMinutes(5);
        return new JourneyRentalPredictionPort.RentalCandidate("station-1", "서울숲역 대여소",
                new BigDecimal("37.55"), new BigDecimal("127.05"), 8, "NORMAL", sourceAt,
                new BigDecimal("0.81"), requiredBikeCount, "HIGH", 500, 300, departureAt.plusSeconds(300),
                sourceAt.plusHours(1), 60L, sourceAt, "model@1", sourceAt, "NORMAL", "NORMAL",
                new JourneyRentalPredictionPort.RouteEvidence(500, 300, "WALK", List.of(
                        new JourneyRentalPredictionPort.RoutePoint(new BigDecimal("37.544"), new BigDecimal("127.056")),
                        new JourneyRentalPredictionPort.RoutePoint(new BigDecimal("37.55"), new BigDecimal("127.05")))));
    }
}
