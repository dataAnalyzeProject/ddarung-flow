package com.ddarungflow.journey.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JourneyCandidateRepository extends JpaRepository<JourneyCandidateEntity, Long> {
    List<JourneyCandidateEntity> findByDecisionPublicId(String decisionId);
}
