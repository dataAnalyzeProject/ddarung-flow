package com.ddarungflow.journey.persistence;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JpaJourneyDecisionPersistenceAdapter implements JourneyDecisionPersistencePort {

    private final JourneyDecisionRepository decisionRepository;

    @Override
    @Transactional
    public StoredDecision save(DecisionToStore decision) {
        validate(decision);
        JourneyDecisionEntity entity = new JourneyDecisionEntity(decision.decisionId(), decision.userId(), decision.revision(),
                decision.status(), decision.normalizedIntentJson(), decision.contractVersions(), decision.generatedAt(), decision.expiresAt());
        decision.candidates().forEach(candidate -> entity.addCandidate(new JourneyCandidateEntity(candidate.candidateKey(),
                candidate.archetype(), candidate.snapshotJson(), candidate.provenanceJson())));
        return toStored(decisionRepository.save(entity));
    }

    @Override
    public Optional<StoredDecision> findActiveDecision(String decisionId, Long userId, OffsetDateTime now) {
        return decisionRepository.findByPublicIdAndUserId(decisionId, userId)
                .filter(entity -> entity.getExpiresAt().isAfter(now))
                .map(this::toStored);
    }

    @Override
    public boolean isExpired(String decisionId, Long userId, OffsetDateTime now) {
        return decisionRepository.findByPublicIdAndUserId(decisionId, userId)
                .map(entity -> !entity.getExpiresAt().isAfter(now))
                .orElse(false);
    }

    @Override
    @Transactional
    public int deleteExpiredDecisions(OffsetDateTime now) {
        List<JourneyDecisionEntity> expired = decisionRepository.findByExpiresAtLessThanEqual(now);
        decisionRepository.deleteAll(expired);
        return expired.size();
    }

    private void validate(DecisionToStore decision) {
        if (decision == null || decision.decisionId() == null || decision.decisionId().isBlank() || decision.userId() == null
                || decision.revision() < 1 || blank(decision.status()) || blank(decision.normalizedIntentJson())
                || blank(decision.contractVersions()) || decision.generatedAt() == null || decision.expiresAt() == null
                || !decision.expiresAt().isAfter(decision.generatedAt()) || decision.candidates() == null) {
            throw new IllegalArgumentException("유효한 Journey decision 저장 정보가 필요합니다.");
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private StoredDecision toStored(JourneyDecisionEntity entity) {
        return new StoredDecision(entity.getPublicId(), entity.getUserId(), entity.getRevision(), entity.getStatus(),
                entity.getNormalizedIntentJson(), entity.getContractVersions(), entity.getGeneratedAt(), entity.getExpiresAt(),
                entity.getCandidates().stream().map(candidate -> new StoredCandidate(candidate.getCandidateKey(), candidate.getArchetype(),
                        candidate.getSnapshotJson(), candidate.getProvenanceJson())).toList());
    }
}
