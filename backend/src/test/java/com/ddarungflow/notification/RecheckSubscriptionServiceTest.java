package com.ddarungflow.notification;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.saved.SavedJourneyDtos;
import com.ddarungflow.journey.saved.SavedJourneyEntity;
import com.ddarungflow.journey.saved.SavedJourneyService;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.payment.PremiumEntitlementService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecheckSubscriptionServiceTest {
    private static final Instant NOW = Instant.parse("2026-09-02T03:00:00Z");

    private final RecheckSubscriptionRepository repository = mock(RecheckSubscriptionRepository.class);
    private final SavedJourneyService savedJourneys = mock(SavedJourneyService.class);
    private final MapPredictionService predictions = mock(MapPredictionService.class);
    private final PremiumEntitlementService premiumEntitlement = mock(PremiumEntitlementService.class);
    private final RecheckNotificationPublisher notificationPublisher = mock(RecheckNotificationPublisher.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final RecheckSubscriptionService service = new RecheckSubscriptionService(repository, savedJourneys,
            predictions, premiumEntitlement, notificationPublisher, entityManager, objectMapper,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void allowUserLock() {
        Query query = mock(Query.class);
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(eq("userId"), anyLong())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of(1L));
        when(repository.save(any(RecheckSubscription.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void searchSubscriptionStoresOnlyStructuredInputAndFixedLead() {
        OffsetDateTime departureAt = OffsetDateTime.ofInstant(NOW.plusSeconds(3600), ZoneOffset.UTC);
        RecheckSubscriptionDtos.CreateRequest request = new RecheckSubscriptionDtos.CreateRequest(
                "SEARCH_RECHECK", null, searchInput(), departureAt);
        when(repository.findByUserIdAndDedupKey(eq(1L), anyString())).thenReturn(Optional.empty());

        RecheckSubscription created = service.create(1L, request);

        assertThat(created.getNotifyAt()).isEqualTo(departureAt.minusMinutes(15));
        assertThat(created.getInputJson()).contains("origin-place", "destination-place", "requiredBikeCount");
        assertThat(created.getInputJson()).doesNotContain("probability", "inventory", "weather", "routeResult");
        assertThat(created.getSavedJourney()).isNull();
        assertThat(created.getDedupKey()).hasSize(64);
    }

    @Test
    void searchSubscriptionRejectsDepartureBeforeFifteenMinuteLead() {
        RecheckSubscriptionDtos.CreateRequest request = new RecheckSubscriptionDtos.CreateRequest(
                "SEARCH_RECHECK", null, searchInput(), OffsetDateTime.ofInstant(NOW.plusSeconds(899), ZoneOffset.UTC));

        assertThatThrownBy(() -> service.create(1L, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("15분");
        verify(repository, never()).save(any());
    }

    @Test
    void sameTargetAndTimeReturnsExistingSubscription() {
        OffsetDateTime departureAt = OffsetDateTime.ofInstant(NOW.plusSeconds(3600), ZoneOffset.UTC);
        RecheckSubscription existing = searchSubscription(departureAt, RecheckSubscription.Status.ACTIVE);
        when(repository.findByUserIdAndDedupKey(eq(1L), anyString())).thenReturn(Optional.of(existing));

        RecheckSubscription result = service.create(1L, new RecheckSubscriptionDtos.CreateRequest(
                "SEARCH_RECHECK", null, searchInput(), departureAt));

        assertThat(result).isSameAs(existing);
        verify(repository, never()).save(any());
    }

    @Test
    void dueSchedulerCreatesOnlyOneReminderEventAcrossRuns() {
        when(notificationPublisher.findDueIds(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC)))
                .thenReturn(List.of(7L), List.of());

        service.publishDueNotifications();
        service.publishDueNotifications();

        verify(notificationPublisher).publish(7L);
        verifyNoPredictionCalls();
    }

    @Test
    void schedulerCreatesNoEventWhenNothingIsDue() {
        when(notificationPublisher.findDueIds(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC)))
                .thenReturn(List.of());

        service.publishDueNotifications();

        verify(notificationPublisher, never()).publish(any());
        verifyNoPredictionCalls();
    }

    @Test
    void schedulerMarksAnExplicitFailedStateWhenEventCreationFails() {
        when(notificationPublisher.findDueIds(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC)))
                .thenReturn(List.of(7L));
        org.mockito.Mockito.doThrow(new IllegalStateException("notification storage unavailable"))
                .when(notificationPublisher).publish(7L);

        service.publishDueNotifications();

        verify(notificationPublisher).markFailed(7L);
        verifyNoPredictionCalls();
    }

    @Test
    void searchExecutionCallsFreshMainPredictionWithoutPremium() throws Exception {
        Users user = user(1L);
        RecheckSubscription subscription = searchSubscription(
                OffsetDateTime.ofInstant(NOW.plusSeconds(3600), ZoneOffset.UTC), RecheckSubscription.Status.DELIVERED);
        when(repository.findByUserIdAndPublicId(1L, "search-public")).thenReturn(Optional.of(subscription));
        when(predictions.buildRouteCandidates(any(), any(), any(), any(), anyString(), eq(null), any()))
                .thenReturn(List.of());

        RecheckSubscriptionDtos.ExecutionResponse result = service.execute(user, "search-public");

        assertThat(result.kind()).isEqualTo("SEARCH_RECHECK");
        verify(predictions).buildRouteCandidates(new BigDecimal("37.5"), new BigDecimal("126.9"),
                new BigDecimal("37.6"), new BigDecimal("127.0"), "WALK", null, 2);
        verify(premiumEntitlement, never()).requireActive(any());
    }

    @Test
    void planExecutionUsesStoredDepartureAndPremiumGuard() throws Exception {
        Users user = user(1L);
        SavedJourneyEntity saved = mock(SavedJourneyEntity.class);
        when(saved.getPublicId()).thenReturn("saved-public");
        OffsetDateTime departureAt = OffsetDateTime.ofInstant(NOW.plusSeconds(3600), ZoneOffset.UTC);
        RecheckSubscription subscription = new RecheckSubscription("plan-public", 1L,
                RecheckSubscription.Kind.PLAN_RECHECK, saved, null, departureAt,
                departureAt.minusMinutes(15), "dedup", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        subscription.markDelivered();
        when(repository.findByUserIdAndPublicId(1L, "plan-public")).thenReturn(Optional.of(subscription));
        when(savedJourneys.replay(eq(1L), eq("saved-public"), any(SavedJourneyDtos.ReplayRequest.class), any(Runnable.class)))
                .thenAnswer(invocation -> {
                    invocation.<Runnable>getArgument(3).run();
                    return mock(JourneyPlanService.Decision.class);
                });

        service.execute(user, "plan-public");

        ArgumentCaptor<SavedJourneyDtos.ReplayRequest> request = ArgumentCaptor.forClass(SavedJourneyDtos.ReplayRequest.class);
        verify(savedJourneys).replay(eq(1L), eq("saved-public"), request.capture(), any(Runnable.class));
        assertThat(request.getValue().departureAt()).isEqualTo(departureAt);
        verify(premiumEntitlement).requireActive(user);
        verifyNoPredictionCalls();
    }

    private RecheckSubscriptionDtos.SearchInput searchInput() {
        return new RecheckSubscriptionDtos.SearchInput(
                new RecheckSubscriptionDtos.PlaceReference("origin-place", "출발지",
                        new BigDecimal("37.5"), new BigDecimal("126.9")),
                new RecheckSubscriptionDtos.PlaceReference("destination-place", "도착지",
                        new BigDecimal("37.6"), new BigDecimal("127.0")),
                "WALK", 2);
    }

    private RecheckSubscription searchSubscription(OffsetDateTime departureAt, RecheckSubscription.Status status) {
        RecheckSubscription subscription = new RecheckSubscription("search-public", 1L,
                RecheckSubscription.Kind.SEARCH_RECHECK, null, write(searchInput()), departureAt,
                departureAt.minusMinutes(15), "dedup", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        if (status == RecheckSubscription.Status.DELIVERED) subscription.markDelivered();
        return subscription;
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private Users user(long id) throws Exception {
        Users user = Users.builder().provider("test").providerUserId("u" + id)
                .displayName("user").role(UserRole.USER).build();
        user.prePersist();
        Field field = Users.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(user, id);
        return user;
    }

    private void verifyNoPredictionCalls() {
        verify(predictions, never()).buildRouteCandidates(any(), any(), any(), any(), any(), any(), any());
    }
}
