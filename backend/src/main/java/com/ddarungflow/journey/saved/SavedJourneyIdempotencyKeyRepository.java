package com.ddarungflow.journey.saved;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SavedJourneyIdempotencyKeyRepository extends JpaRepository<SavedJourneyIdempotencyKeyEntity, Long> {
    Optional<SavedJourneyIdempotencyKeyEntity> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);
    long countBySavedJourneyId(Long savedJourneyId);
    void deleteBySavedJourneyId(Long savedJourneyId);
}
