package com.ddarungflow.journey.saved;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SavedJourneyRepository extends JpaRepository<SavedJourneyEntity, Long> {
    Optional<SavedJourneyEntity> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);
    List<SavedJourneyEntity> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<SavedJourneyEntity> findByUserIdAndPublicId(Long userId, String publicId);
}
