package com.ddarungflow.journey.saved;

import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.map.MapApiDtos;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedJourneyService {

    static final int MAX_SAVED_JOURNEYS_PER_USER = 10;

    private final SavedJourneyRepository repository;
    private final SavedJourneyIdempotencyKeyRepository idempotencyKeys;
    private final EntityManager entityManager;
    private final JourneyPlanService journeyPlans;
    private final KakaoMapClient places;

    @Transactional
    public SavedJourneyEntity save(Long userId, String idempotencyKey, SavedJourneyDtos.SaveRequest request) {
        validate(userId, idempotencyKey, request);
        SavedJourneyDtos.ReplayInput replayInput = replayInput(request);
        String replayInputJson = canonicalJson(replayInput);
        String requestHash = sha256(replayInputJson);
        lockUser(userId);
        SavedJourneyIdempotencyKeyEntity existingKey = idempotencyKeys.findByUserIdAndIdempotencyKey(userId, idempotencyKey).orElse(null);
        if (existingKey != null) {
            if (!existingKey.getRequestHash().equals(requestHash)) throw new IdempotencyConflictException();
            SavedJourneyEntity existing = existingKey.getSavedJourney();
            existing.getDisplayName();
            return existing;
        }

        SavedJourneyEntity saved = repository.findByUserIdAndDuplicateKey(userId, requestHash).orElse(null);
        if (saved == null) {
            if (repository.countByUserId(userId) >= MAX_SAVED_JOURNEYS_PER_USER) throw new SavedJourneyLimitException();
            saved = repository.save(new SavedJourneyEntity(userId, displayName(request), replayInputJson, requestHash));
        }
        idempotencyKeys.save(new SavedJourneyIdempotencyKeyEntity(userId, idempotencyKey, requestHash, saved));
        return saved;
    }

    public List<SavedJourneyEntity> list(Long userId) {
        if (userId == null) throw new IllegalArgumentException("로그인이 필요합니다.");
        return repository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public SavedJourneyEntity findOwned(Long userId, String savedJourneyId) {
        if (userId == null || savedJourneyId == null || savedJourneyId.isBlank()) {
            throw new IllegalArgumentException("저장 여정 ID가 필요합니다.");
        }
        return repository.findByUserIdAndPublicId(userId, savedJourneyId)
                .orElseThrow(SavedJourneyNotFoundException::new);
    }

    @Transactional
    public void delete(Long userId, String savedJourneyId) {
        if (userId == null || savedJourneyId == null || savedJourneyId.isBlank()) throw new IllegalArgumentException("저장 여정 ID가 필요합니다.");
        SavedJourneyEntity saved = findOwned(userId, savedJourneyId);
        idempotencyKeys.deleteBySavedJourneyId(saved.getId());
        repository.delete(saved);
    }

    public JourneyPlanService.Decision replay(Long userId, String savedJourneyId,
                                              SavedJourneyDtos.ReplayRequest request,
                                              Runnable requireAiEntitlement) {
        if (userId == null || savedJourneyId == null || savedJourneyId.isBlank()) {
            throw new IllegalArgumentException("저장 여정 ID가 필요합니다.");
        }
        SavedJourneyEntity saved = findOwned(userId, savedJourneyId);
        SavedJourneyDtos.ReplayInput stored = replayInput(saved);
        if (request == null || request.departureAt() == null) {
            throw new IllegalArgumentException("새 출발시각이 필요합니다.");
        }
        requireAiEntitlement.run();

        JourneyPlanService.Place origin = currentPlace(stored.origin());
        JourneyPlanService.Place destination = stored.destination() == null ? null : currentPlace(stored.destination());
        Integer requiredBikeCount = valueOrStored(request.requiredBikeCount(), stored.requiredBikeCount());
        Integer maxJourneyMinutes = valueOrStored(request.maxJourneyMinutes(), stored.maxJourneyMinutes());
        Map<String, Object> preferences = new LinkedHashMap<>();
        if (stored.preferences() != null) preferences.putAll(stored.preferences());
        if (request.preferences() != null) preferences.putAll(request.preferences());
        List<String> hardConstraints = request.hardConstraints() == null
                ? stored.hardConstraints() : request.hardConstraints();
        Integer availableMinutes = request.availableMinutes() == null
                ? stored.totalJourneyMinutes() : request.availableMinutes();
        JourneyPlanService.PlanConstraints constraints = new JourneyPlanService.PlanConstraints(
                availableMinutes, request.themes(), request.stopCount(), request.routeMode());
        JourneyPlanService.PlanInput input = new JourneyPlanService.PlanInput(JourneyPlanService.RequestMode.FORM,
                null, origin, destination, request.departureAt(), maxJourneyMinutes, requiredBikeCount,
                preferences, hardConstraints, null, constraints);
        return journeyPlans.planSavedReplay(userId, input);
    }

    public SavedJourneyDtos.ReplayInput replayInput(SavedJourneyEntity entity) {
        try {
            return new ObjectMapper().readValue(entity.getReplayInputJson(), SavedJourneyDtos.ReplayInput.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("저장된 Journey 입력을 읽을 수 없습니다.", exception);
        }
    }

    private void validate(Long userId, String idempotencyKey, SavedJourneyDtos.SaveRequest request) {
        if (userId == null || idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128 || request == null
                || !validPlace(request.origin()) || (request.destination() != null && !validPlace(request.destination())) || request.requiredBikeCount() == null
                || request.requiredBikeCount() < 1 || request.requiredBikeCount() > 5 || request.totalJourneyMinutes() == null
                || request.totalJourneyMinutes() < 1 || request.maxJourneyMinutes() == null || request.maxJourneyMinutes() < 1
                || request.maxJourneyMinutes() > request.totalJourneyMinutes()) {
            throw new IllegalArgumentException("유효한 구조화 Journey 재실행 입력이 필요합니다.");
        }
    }

    private boolean validPlace(SavedJourneyDtos.PlaceInput place) {
        boolean bothCoordinatesPresent = place != null && place.latitude() != null && place.longitude() != null;
        boolean noCoordinates = place != null && place.latitude() == null && place.longitude() == null;
        return place != null && !blank(place.providerId()) && !blank(place.displayName()) && (bothCoordinatesPresent || noCoordinates);
    }

    private JourneyPlanService.Place currentPlace(SavedJourneyDtos.PlaceInput place) {
        if (!validPlace(place)) throw new IllegalArgumentException("저장된 장소가 유효하지 않습니다.");
        if (place.latitude() != null && place.longitude() != null) {
            return new JourneyPlanService.Place(place.providerId(), place.displayName(),
                    place.latitude().doubleValue(), place.longitude().doubleValue());
        }
        try {
            MapApiDtos.PlaceSearchResponseDto resolved = places.searchPlaces(place.displayName()).stream()
                    .filter(candidate -> place.providerId().equals(candidate.placeId()))
                    .findFirst().orElseThrow(PlaceReferenceUnavailableException::new);
            return new JourneyPlanService.Place(resolved.placeId(), resolved.name(),
                    resolved.latitude().doubleValue(), resolved.longitude().doubleValue());
        } catch (PlaceReferenceUnavailableException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new PlaceReferenceUnavailableException();
        }
    }

    private Integer valueOrStored(Integer override, Integer stored) {
        return override == null ? stored : override;
    }

    private String displayName(SavedJourneyDtos.SaveRequest request) {
        if (!blank(request.displayName())) return request.displayName();
        return request.destination() == null ? request.origin().displayName() : request.origin().displayName() + " → " + request.destination().displayName();
    }

    private void lockUser(Long userId) {
        if (entityManager.createNativeQuery("select id from users where id = :userId for update")
                .setParameter("userId", userId).getResultList().isEmpty()) {
            throw new IllegalArgumentException("로그인이 필요합니다.");
        }
    }

    private SavedJourneyDtos.ReplayInput replayInput(SavedJourneyDtos.SaveRequest request) {
        return new SavedJourneyDtos.ReplayInput(request.origin(), request.destination(), request.requiredBikeCount(),
                request.totalJourneyMinutes(), request.maxJourneyMinutes(), request.preferences(), request.hardConstraints());
    }

    private String canonicalJson(SavedJourneyDtos.ReplayInput request) {
        try {
            return new ObjectMapper().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true).writeValueAsString(request);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Journey 입력을 저장할 수 없습니다.", exception);
        }
    }

    private String sha256(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(64);
            for (byte value : hash) builder.append(String.format("%02x", value));
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    public static class SavedJourneyNotFoundException extends RuntimeException { }
    public static class SavedJourneyLimitException extends RuntimeException { }
    public static class IdempotencyConflictException extends RuntimeException { }
    public static class PlaceReferenceUnavailableException extends RuntimeException { }
}
