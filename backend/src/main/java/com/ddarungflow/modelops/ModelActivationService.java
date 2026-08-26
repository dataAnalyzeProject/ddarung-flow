package com.ddarungflow.modelops;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.entity.UserRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
@Transactional
public class ModelActivationService {
    private final ModelArtifactRepository artifactRepository;
    private final ActivationAttemptService attemptService;
    private final ModelActivationGateway gateway;
    private final AuditEventService auditEventService;

    public ModelActivationService(ModelArtifactRepository artifactRepository, ActivationAttemptService attemptService,
                                  ModelActivationGateway gateway, AuditEventService auditEventService) {
        this.artifactRepository = artifactRepository;
        this.attemptService = attemptService;
        this.gateway = gateway;
        this.auditEventService = auditEventService;
    }

    public ActivationResult activate(Long candidateId, Long actorUserId, UserRole actorRole) {
        ModelArtifact candidate = artifactRepository.findById(candidateId).orElseThrow(PromotionGateException::new);
        if (candidate.getState() != ModelArtifactState.APPROVED || candidate.getManifestKey() == null || candidate.getManifestSha256() == null) {
            throw new PromotionGateException();
        }
        ModelArtifact previous = artifactRepository.findFirstByState(ModelArtifactState.ACTIVE).orElseThrow(PromotionGateException::new);
        return switchTo(candidate, previous, actorUserId, actorRole, "MODEL_ACTIVATE");
    }

    public ActivationResult rollback(Long actorUserId, UserRole actorRole) {
        ModelArtifact current = artifactRepository.findFirstByState(ModelArtifactState.ACTIVE).orElseThrow(RollbackTargetUnavailableException::new);
        ModelArtifact previous = artifactRepository.findFirstByStateOrderByIdDesc(ModelArtifactState.RETIRED).orElseThrow(RollbackTargetUnavailableException::new);
        if (previous.getManifestKey() == null || previous.getManifestSha256() == null) {
            throw new RollbackTargetUnavailableException();
        }
        return switchTo(previous, current, actorUserId, actorRole, "MODEL_ROLLBACK");
    }

    private ActivationResult switchTo(ModelArtifact candidate, ModelArtifact previous, Long actorUserId, UserRole actorRole, String action) {
        String correlationId = UUID.randomUUID().toString();
        OffsetDateTime now = OffsetDateTime.now();
        ActivationAttempt attempt = attemptService.start(candidate.getId(), previous.getId(), actorUserId, correlationId, now);
        try {
            gateway.activate(candidate);
            previous.transitionTo(ModelArtifactState.RETIRED);
            candidate.transitionTo(ModelArtifactState.ACTIVE);
            artifactRepository.save(previous);
            artifactRepository.save(candidate);
            attemptService.finish(attempt.getId(), ActivationAttemptStatus.SUCCEEDED, null, OffsetDateTime.now());
            auditEventService.appendEvent(actorUserId, actorRole, action, "MODEL", String.valueOf(candidate.getId()), AuditResult.SUCCESS, null, correlationId, OffsetDateTime.now());
            return new ActivationResult(attempt.getId(), candidate.getId(), previous.getId(), ModelArtifactState.ACTIVE);
        } catch (RuntimeException exception) {
            try {
                gateway.activate(previous);
                attemptService.finish(attempt.getId(), ActivationAttemptStatus.FAILED_COMPENSATED, "POST_SWITCH_SMOKE_FAILED", OffsetDateTime.now());
                auditEventService.appendEvent(actorUserId, actorRole, action, "MODEL", String.valueOf(candidate.getId()), AuditResult.FAILURE, "POST_SWITCH_SMOKE_FAILED", correlationId, OffsetDateTime.now());
                throw new ActivationFailedException();
            } catch (ActivationFailedException activationFailed) {
                throw activationFailed;
            } catch (RuntimeException compensationFailure) {
                attemptService.finish(attempt.getId(), ActivationAttemptStatus.COMPENSATION_FAILED, "COMPENSATION_FAILED", OffsetDateTime.now());
                auditEventService.appendEvent(actorUserId, actorRole, action, "MODEL", String.valueOf(candidate.getId()), AuditResult.FAILURE, "COMPENSATION_FAILED", correlationId, OffsetDateTime.now());
                throw new CompensationFailedException();
            }
        }
    }

    public record ActivationResult(Long activationAttemptId, Long candidateModelId, Long previousActiveModelId, ModelArtifactState finalState) { }
    public static class PromotionGateException extends RuntimeException { }
    public static class RollbackTargetUnavailableException extends RuntimeException { }
    public static class ActivationFailedException extends RuntimeException { }
    public static class CompensationFailedException extends RuntimeException { }
}
