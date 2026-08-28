package com.ddarungflow.journey.saved;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedJourneyService {

    private final SavedJourneyRepository repository;

    @Transactional
    public SavedJourneyEntity save(Long userId, String idempotencyKey, SavedJourneyDtos.SaveRequest request) {
        validate(userId, idempotencyKey, request);
        String replayInputJson = canonicalJson(request);
        String payloadHash = sha256(replayInputJson);
        return repository.findByUserIdAndIdempotencyKey(userId, idempotencyKey)
                .map(existing -> {
                    if (!existing.getPayloadHash().equals(payloadHash)) throw new IdempotencyConflictException();
                    return existing;
                })
                .orElseGet(() -> repository.save(new SavedJourneyEntity(userId, displayName(request), replayInputJson, payloadHash, idempotencyKey)));
    }

    public List<SavedJourneyEntity> list(Long userId) {
        if (userId == null) throw new IllegalArgumentException("로그인이 필요합니다.");
        return repository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void delete(Long userId, String savedJourneyId) {
        if (userId == null || savedJourneyId == null || savedJourneyId.isBlank()) throw new IllegalArgumentException("저장 여정 ID가 필요합니다.");
        SavedJourneyEntity saved = repository.findByUserIdAndPublicId(userId, savedJourneyId).orElseThrow(SavedJourneyNotFoundException::new);
        repository.delete(saved);
    }

    public SavedJourneyDtos.SaveRequest replayInput(SavedJourneyEntity entity) {
        try {
            return new ObjectMapper().readValue(entity.getReplayInputJson(), SavedJourneyDtos.SaveRequest.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("저장된 Journey 입력을 읽을 수 없습니다.", exception);
        }
    }

    private void validate(Long userId, String idempotencyKey, SavedJourneyDtos.SaveRequest request) {
        if (userId == null || idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128 || request == null
                || !validPlace(request.origin()) || !validPlace(request.destination()) || request.requiredBikeCount() == null
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

    private String displayName(SavedJourneyDtos.SaveRequest request) {
        return blank(request.displayName()) ? request.origin().displayName() + " → " + request.destination().displayName() : request.displayName();
    }

    private String canonicalJson(SavedJourneyDtos.SaveRequest request) {
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
    public static class IdempotencyConflictException extends RuntimeException { }
}
