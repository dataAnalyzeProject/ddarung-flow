package com.ddarungflow.journey.persistence;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface JourneyDecisionPersistencePort {
    StoredDecision save(DecisionToStore decision);
    Optional<StoredDecision> findActiveDecision(String decisionId, Long userId, OffsetDateTime now);
    boolean isExpired(String decisionId, Long userId, OffsetDateTime now);
    int deleteExpiredDecisions(OffsetDateTime now);

    record DecisionToStore(String decisionId, Long userId, int revision, String status, String normalizedIntentJson,
                           String contractVersions, OffsetDateTime generatedAt, OffsetDateTime expiresAt,
                           List<CandidateToStore> candidates) { }

    record CandidateToStore(String candidateKey, String archetype, String snapshotJson, String provenanceJson) { }

    record StoredDecision(String decisionId, Long userId, int revision, String status, String normalizedIntentJson,
                          String contractVersions, OffsetDateTime generatedAt, OffsetDateTime expiresAt,
                          List<StoredCandidate> candidates) { }

    record StoredCandidate(String candidateKey, String archetype, String snapshotJson, String provenanceJson) { }
}
