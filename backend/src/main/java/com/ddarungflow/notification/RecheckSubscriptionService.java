package com.ddarungflow.notification;

import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.saved.SavedJourneyDtos;
import com.ddarungflow.journey.saved.SavedJourneyEntity;
import com.ddarungflow.journey.saved.SavedJourneyService;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.payment.PremiumEntitlementService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class RecheckSubscriptionService {
    static final Duration SEARCH_RECHECK_LEAD = Duration.ofMinutes(15);
    private static final Set<String> SEARCH_TRAVEL_MODES = Set.of("WALK", "PUBLIC_TRANSIT", "TRANSIT", "BICYCLE");

    private final RecheckSubscriptionRepository repository;
    private final SavedJourneyService savedJourneys;
    private final MapPredictionService predictions;
    private final PremiumEntitlementService premiumEntitlement;
    private final RecheckNotificationPublisher notificationPublisher;
    private final EntityManager entityManager;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public RecheckSubscriptionService(RecheckSubscriptionRepository repository,
                                      SavedJourneyService savedJourneys,
                                      MapPredictionService predictions,
                                      PremiumEntitlementService premiumEntitlement,
                                      RecheckNotificationPublisher notificationPublisher,
                                      EntityManager entityManager,
                                      ObjectMapper objectMapper) {
        this(repository, savedJourneys, predictions, premiumEntitlement, notificationPublisher, entityManager,
                objectMapper, Clock.systemDefaultZone());
    }

    RecheckSubscriptionService(RecheckSubscriptionRepository repository,
                               SavedJourneyService savedJourneys,
                               MapPredictionService predictions,
                               PremiumEntitlementService premiumEntitlement,
                               RecheckNotificationPublisher notificationPublisher,
                               EntityManager entityManager,
                               ObjectMapper objectMapper,
                               Clock clock) {
        this.repository = repository;
        this.savedJourneys = savedJourneys;
        this.predictions = predictions;
        this.premiumEntitlement = premiumEntitlement;
        this.notificationPublisher = notificationPublisher;
        this.entityManager = entityManager;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional
    public RecheckSubscription create(Long userId, RecheckSubscriptionDtos.CreateRequest request) {
        if (userId == null || request == null || request.departureAt() == null) {
            throw new IllegalArgumentException("재확인 종류와 출발시각이 필요합니다.");
        }
        RecheckSubscription.Kind kind = kind(request.kind());
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!request.departureAt().isAfter(now)) {
            throw new IllegalArgumentException("출발시각은 현재보다 이후여야 합니다.");
        }

        SavedJourneyEntity savedJourney = null;
        String inputJson = null;
        String target;
        if (kind == RecheckSubscription.Kind.PLAN_RECHECK) {
            if (request.searchInput() != null) throw new IllegalArgumentException("PLAN 재확인에는 검색 입력을 저장하지 않습니다.");
            savedJourney = savedJourneys.findOwned(userId, request.savedJourneyId());
            target = "saved:" + savedJourney.getId();
        } else {
            if (request.savedJourneyId() != null) throw new IllegalArgumentException("SEARCH 재확인에는 저장 여정 ID를 사용하지 않습니다.");
            validateSearchInput(request.searchInput());
            if (request.departureAt().isBefore(now.plus(SEARCH_RECHECK_LEAD))) {
                throw new IllegalArgumentException("SEARCH 재확인은 출발 15분 전까지 신청해야 합니다.");
            }
            RecheckSubscriptionDtos.SearchInput normalized = normalize(request.searchInput());
            inputJson = json(normalized);
            target = "search:" + normalized.origin().providerId() + "|" + normalized.origin().latitude()
                    + "|" + normalized.origin().longitude() + "|" + normalized.destination().providerId()
                    + "|" + normalized.destination().latitude() + "|" + normalized.destination().longitude()
                    + "|" + normalized.travelMode() + "|" + normalized.requiredBikeCount();
        }

        // departureAt is the user's own stated departure time; notifyAt is always derived here as
        // departureAt minus the fixed lead, never a value the client sends directly.
        OffsetDateTime notifyAt = request.departureAt().minus(SEARCH_RECHECK_LEAD);
        String dedupKey = sha256(kind + "|" + target + "|" + request.departureAt().toInstant());
        lockUser(userId);
        RecheckSubscription existing = repository.findByUserIdAndDedupKey(userId, dedupKey).orElse(null);
        if (existing != null) return existing;

        return repository.save(new RecheckSubscription(UUID.randomUUID().toString(), userId, kind, savedJourney,
                inputJson, request.departureAt(), notifyAt, dedupKey, now));
    }

    public List<RecheckSubscription> list(Long userId) {
        if (userId == null) throw new IllegalArgumentException("로그인이 필요합니다.");
        return repository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void cancel(Long userId, String publicId) {
        owned(userId, publicId).cancel();
    }

    public RecheckSubscriptionDtos.ExecutionResponse execute(Users user, String publicId) {
        if (user == null || user.getId() == null) throw new IllegalArgumentException("로그인이 필요합니다.");
        RecheckSubscription subscription = owned(user.getId(), publicId);
        if (subscription.getStatus() != RecheckSubscription.Status.DELIVERED) {
            throw new RecheckNotExecutableException();
        }
        if (subscription.getKind() == RecheckSubscription.Kind.PLAN_RECHECK) {
            JourneyPlanService.Decision result = savedJourneys.replay(user.getId(),
                    subscription.getSavedJourney().getPublicId(),
                    new SavedJourneyDtos.ReplayRequest(subscription.getDepartureAt(), null, null, null,
                            null, null, null, null, null),
                    () -> premiumEntitlement.requireActive(user));
            return new RecheckSubscriptionDtos.ExecutionResponse(subscription.getKind().name(), result);
        }

        RecheckSubscriptionDtos.SearchInput input = searchInput(subscription);
        Object result = predictions.buildRouteCandidates(input.origin().latitude(), input.origin().longitude(),
                input.destination().latitude(), input.destination().longitude(), input.travelMode(), null,
                input.requiredBikeCount());
        return new RecheckSubscriptionDtos.ExecutionResponse(subscription.getKind().name(), result);
    }

    @Scheduled(
            fixedDelayString = "${notifications.recheck.fixed-delay-ms:60000}",
            initialDelayString = "${notifications.recheck.initial-delay-ms:60000}"
    )
    public void publishDueNotifications() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        for (Long subscriptionId : notificationPublisher.findDueIds(now)) {
            try {
                notificationPublisher.publish(subscriptionId);
            } catch (RuntimeException exception) {
                notificationPublisher.markFailed(subscriptionId);
            }
        }
    }

    public RecheckSubscriptionDtos.SubscriptionResponse response(RecheckSubscription subscription) {
        return new RecheckSubscriptionDtos.SubscriptionResponse(subscription.getPublicId(),
                subscription.getKind().name(), subscription.getStatus().name(),
                subscription.getSavedJourney() == null ? null : subscription.getSavedJourney().getPublicId(),
                subscription.getInputJson() == null ? null : searchInput(subscription),
                subscription.getDepartureAt(), subscription.getNotifyAt(), subscription.getCreatedAt());
    }

    private RecheckSubscription owned(Long userId, String publicId) {
        if (userId == null || publicId == null || publicId.isBlank()) throw new IllegalArgumentException("재확인 ID가 필요합니다.");
        return repository.findByUserIdAndPublicId(userId, publicId).orElseThrow(RecheckSubscriptionNotFoundException::new);
    }

    private RecheckSubscription.Kind kind(String value) {
        try {
            return RecheckSubscription.Kind.valueOf(value == null ? "" : value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("지원하지 않는 재확인 종류입니다.");
        }
    }

    private void validateSearchInput(RecheckSubscriptionDtos.SearchInput input) {
        if (input == null || !validPlace(input.origin()) || !validPlace(input.destination())
                || input.travelMode() == null
                || !SEARCH_TRAVEL_MODES.contains(input.travelMode().toUpperCase(Locale.ROOT))
                || input.requiredBikeCount() == null || input.requiredBikeCount() < 1
                || input.requiredBikeCount() > 5) {
            throw new IllegalArgumentException("유효한 구조화 검색 입력이 필요합니다.");
        }
    }

    private boolean validPlace(RecheckSubscriptionDtos.PlaceReference place) {
        return place != null && !blank(place.providerId()) && !blank(place.displayName())
                && coordinate(place.latitude(), new BigDecimal("-90"), new BigDecimal("90"))
                && coordinate(place.longitude(), new BigDecimal("-180"), new BigDecimal("180"));
    }

    private boolean coordinate(BigDecimal value, BigDecimal minimum, BigDecimal maximum) {
        return value != null && value.compareTo(minimum) >= 0 && value.compareTo(maximum) <= 0;
    }

    private RecheckSubscriptionDtos.SearchInput normalize(RecheckSubscriptionDtos.SearchInput input) {
        return new RecheckSubscriptionDtos.SearchInput(
                normalize(input.origin()), normalize(input.destination()),
                input.travelMode().toUpperCase(Locale.ROOT), input.requiredBikeCount());
    }

    private RecheckSubscriptionDtos.PlaceReference normalize(RecheckSubscriptionDtos.PlaceReference place) {
        return new RecheckSubscriptionDtos.PlaceReference(place.providerId(), place.displayName(),
                place.latitude().stripTrailingZeros(), place.longitude().stripTrailingZeros());
    }

    private RecheckSubscriptionDtos.SearchInput searchInput(RecheckSubscription subscription) {
        try {
            return objectMapper.readValue(subscription.getInputJson(), RecheckSubscriptionDtos.SearchInput.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("저장된 검색 재확인 입력을 읽을 수 없습니다.", exception);
        }
    }

    private String json(RecheckSubscriptionDtos.SearchInput input) {
        try {
            return objectMapper.writeValueAsString(input);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("검색 재확인 입력을 저장할 수 없습니다.", exception);
        }
    }

    private void lockUser(Long userId) {
        if (entityManager.createNativeQuery("select id from users where id = :userId for update")
                .setParameter("userId", userId).getResultList().isEmpty()) {
            throw new IllegalArgumentException("로그인이 필요합니다.");
        }
    }

    private String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    public static class RecheckSubscriptionNotFoundException extends RuntimeException { }
    public static class RecheckNotExecutableException extends RuntimeException { }
}
