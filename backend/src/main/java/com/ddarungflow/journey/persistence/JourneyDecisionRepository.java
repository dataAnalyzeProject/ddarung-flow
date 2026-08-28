package com.ddarungflow.journey.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface JourneyDecisionRepository extends JpaRepository<JourneyDecisionEntity, Long> {
    Optional<JourneyDecisionEntity> findByPublicIdAndUserId(String publicId, Long userId);
    List<JourneyDecisionEntity> findByExpiresAtLessThanEqual(OffsetDateTime now);
}
