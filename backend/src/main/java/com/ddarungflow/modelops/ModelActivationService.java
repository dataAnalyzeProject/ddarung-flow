package com.ddarungflow.modelops;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.entity.UserRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.Collection;
import java.util.List;

@Service
public class ModelActivationService {
    private final ModelArtifactRepository artifactRepository;
    private final ActivationAttemptService attemptService;
    private final ActivationAttemptRepository attemptRepository;
    private final ModelActivationGateway gateway;
    private final AuditEventService auditEventService;
    private final TransactionTemplate transactionTemplate;

    public ModelActivationService(ModelArtifactRepository artifactRepository, ActivationAttemptService attemptService,
                                  ActivationAttemptRepository attemptRepository, ModelActivationGateway gateway,
                                  AuditEventService auditEventService, PlatformTransactionManager transactionManager) {
        this.artifactRepository = artifactRepository;
        this.attemptService = attemptService;
        this.attemptRepository = attemptRepository;
        this.gateway = gateway;
        this.auditEventService = auditEventService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public ActivationResult activate(Long candidateId, Long actorUserId, UserRole actorRole) {
        return activate(candidateId, actorUserId, actorRole, List.of(actorRole));
    }

    public ActivationResult activate(Long candidateId, Long actorUserId, UserRole actorRole, Collection<?> actorRoleCodes) {
        ModelArtifact candidate = artifactRepository.findById(candidateId).orElseThrow(PromotionGateException::new);
        if (candidate.getState() != ModelArtifactState.APPROVED || candidate.getManifestKey() == null || candidate.getManifestSha256() == null) {
            throw new PromotionGateException();
        }
        ModelArtifact previous = artifactRepository.findFirstByState(ModelArtifactState.ACTIVE).orElseThrow(PromotionGateException::new);
        return switchTo(candidate, previous, actorUserId, actorRole, actorRoleCodes, "MODEL_ACTIVATE");
    }

    public ActivationResult rollback(Long actorUserId, UserRole actorRole) {
        return rollback(actorUserId, actorRole, List.of(actorRole));
    }

    public ActivationResult rollback(Long actorUserId, UserRole actorRole, Collection<?> actorRoleCodes) {
        ModelArtifact current = artifactRepository.findFirstByState(ModelArtifactState.ACTIVE).orElseThrow(RollbackTargetUnavailableException::new);
        ActivationAttempt activation = attemptRepository.findFirstByCandidateModelIdAndStatusOrderByIdDesc(current.getId(), ActivationAttemptStatus.SUCCEEDED)
            .orElseThrow(RollbackTargetUnavailableException::new);
        if (activation.getPreviousModelId() == null) {
            throw new RollbackTargetUnavailableException();
        }
        ModelArtifact previous = artifactRepository.findById(activation.getPreviousModelId()).orElseThrow(RollbackTargetUnavailableException::new);
        if (previous.getState() != ModelArtifactState.RETIRED || previous.getManifestKey() == null || previous.getManifestSha256() == null) {
            throw new RollbackTargetUnavailableException();
        }
        return switchTo(previous, current, actorUserId, actorRole, actorRoleCodes, "MODEL_ROLLBACK");
    }

    private ActivationResult switchTo(ModelArtifact candidate, ModelArtifact previous, Long actorUserId,
                                      UserRole actorRole, Collection<?> actorRoleCodes, String action) {
        String correlationId = UUID.randomUUID().toString();
        OffsetDateTime now = OffsetDateTime.now();
        ActivationAttempt attempt = attemptService.start(candidate.getId(), previous.getId(), actorUserId, correlationId, now);
        try {
            return transactionTemplate.execute(status -> {
                gateway.activate(candidate);
                previous.transitionTo(ModelArtifactState.RETIRED);
                candidate.transitionTo(ModelArtifactState.ACTIVE);
                artifactRepository.save(previous);
                artifactRepository.save(candidate);
                attemptService.finish(attempt.getId(), ActivationAttemptStatus.SUCCEEDED, null, OffsetDateTime.now());
                auditEventService.appendEvent(actorUserId, actorRole, actorRoleCodes, action, "MODEL", candidate.getVersion(),
                        AuditResult.SUCCESS, null, null, correlationId, OffsetDateTime.now());
                return new ActivationResult(attempt.getId(), candidate.getId(), previous.getId(), ModelArtifactState.ACTIVE);
            });
        } catch (RuntimeException exception) {
            try {
                gateway.activate(previous);
                attemptService.finish(attempt.getId(), ActivationAttemptStatus.FAILED_COMPENSATED, "POST_SWITCH_SMOKE_FAILED", OffsetDateTime.now());
                auditEventService.appendEvent(actorUserId, actorRole, actorRoleCodes, action, "MODEL", candidate.getVersion(),
                        AuditResult.FAILURE, "POST_SWITCH_SMOKE_FAILED", null, correlationId, OffsetDateTime.now());
                throw new ActivationFailedException();
            } catch (ActivationFailedException activationFailed) {
                throw activationFailed;
            } catch (RuntimeException compensationFailure) {
                attemptService.finish(attempt.getId(), ActivationAttemptStatus.COMPENSATION_FAILED, "COMPENSATION_FAILED", OffsetDateTime.now());
                auditEventService.appendEvent(actorUserId, actorRole, actorRoleCodes, action, "MODEL", candidate.getVersion(),
                        AuditResult.FAILURE, "COMPENSATION_FAILED", null, correlationId, OffsetDateTime.now());
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
