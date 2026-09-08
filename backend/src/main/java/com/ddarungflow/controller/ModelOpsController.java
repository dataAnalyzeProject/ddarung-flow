package com.ddarungflow.controller;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.ModelOpsDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.modelops.ModelArtifact;
import com.ddarungflow.modelops.ModelArtifactState;
import com.ddarungflow.modelops.ModelActivationService;
import com.ddarungflow.modelops.ModelHistoryRepository;
import com.ddarungflow.modelops.ModelRegistryService;
import com.ddarungflow.modelops.ModelUpload;
import com.ddarungflow.modelops.ModelUploadService;
import com.ddarungflow.modelops.RuntimeModelRegistryService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ExceptionHandler;
import jakarta.servlet.http.HttpServletRequest;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
public class ModelOpsController {

    private final ModelRegistryService modelRegistryService;
    private final ModelUploadService modelUploadService;
    private final ModelActivationService modelActivationService;
    private final AuditEventService auditEventService;
    private final ModelHistoryRepository modelHistoryRepository;
    private final RuntimeModelRegistryService runtimeModelRegistryService;

    public ModelOpsController(ModelRegistryService modelRegistryService, ModelUploadService modelUploadService,
                              ModelActivationService modelActivationService, AuditEventService auditEventService,
                              ModelHistoryRepository modelHistoryRepository,
                              RuntimeModelRegistryService runtimeModelRegistryService) {
        this.modelRegistryService = modelRegistryService;
        this.modelUploadService = modelUploadService;
        this.modelActivationService = modelActivationService;
        this.auditEventService = auditEventService;
        this.modelHistoryRepository = modelHistoryRepository;
        this.runtimeModelRegistryService = runtimeModelRegistryService;
    }

    @PostMapping("/model-uploads")
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ResponseEntity<ModelOpsDtos.UploadResponse> createUpload(
        @RequestBody ModelOpsDtos.CreateUploadRequest request,
        @AuthenticationPrincipal PrincipalDetails principal
    ) {
        UUID auditTarget = UUID.randomUUID();
        try {
            ModelUpload upload = modelUploadService.createUpload(principal.getUsers().getId(), request.fileName(),
                    request.expectedSha256(), request.maxBytes(), request.expiresAt(), OffsetDateTime.now());
            auditUpload(principal, "MODEL_UPLOAD_CREATE", upload.getId(), AuditResult.SUCCESS, null);
            return ResponseEntity.status(HttpStatus.CREATED).body(ModelOpsDtos.UploadResponse.from(upload));
        } catch (RuntimeException error) {
            auditUpload(principal, "MODEL_UPLOAD_CREATE", auditTarget, AuditResult.FAILURE, uploadReason(error));
            throw error;
        }
    }

    @PutMapping(value = "/model-uploads/{id}/content", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ModelOpsDtos.UploadResponse uploadContent(@PathVariable UUID id, HttpServletRequest request,
                                                      @AuthenticationPrincipal PrincipalDetails principal) {
        try {
            ModelUpload upload = modelUploadService.uploadContent(id, principal.getUsers().getId(),
                    request.getInputStream(), OffsetDateTime.now());
            auditUpload(principal, "MODEL_UPLOAD_CONTENT", id, AuditResult.SUCCESS, null);
            return ModelOpsDtos.UploadResponse.from(upload);
        } catch (RuntimeException error) {
            auditUpload(principal, "MODEL_UPLOAD_CONTENT", id, AuditResult.FAILURE, uploadReason(error));
            throw error;
        } catch (java.io.IOException error) {
            auditUpload(principal, "MODEL_UPLOAD_CONTENT", id, AuditResult.FAILURE, "MODEL_UPLOAD_STORAGE_UNAVAILABLE");
            throw new ModelUploadService.StorageUnavailableException(error);
        }
    }

    @PostMapping("/model-uploads/{id}/complete")
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ModelOpsDtos.UploadResponse completeUpload(@PathVariable UUID id,
                                                       @AuthenticationPrincipal PrincipalDetails principal) {
        try {
            ModelUpload upload = modelUploadService.complete(id, principal.getUsers().getId(), OffsetDateTime.now());
            auditUpload(principal, "MODEL_UPLOAD_COMPLETE", id, AuditResult.SUCCESS, null);
            return ModelOpsDtos.UploadResponse.from(upload);
        } catch (RuntimeException error) {
            auditUpload(principal, "MODEL_UPLOAD_COMPLETE", id, AuditResult.FAILURE, uploadReason(error));
            throw error;
        }
    }

    @PostMapping("/models")
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ResponseEntity<ModelOpsDtos.ModelResponse> createModel(
        @RequestBody ModelOpsDtos.CreateModelRequest request,
        @AuthenticationPrincipal PrincipalDetails principal
    ) {
        try {
            if (request.artifactUploadId() == null || request.manifestUploadId() == null
                    || request.artifactUploadId().equals(request.manifestUploadId())) {
                throw new IllegalArgumentException("distinct artifactUploadId and manifestUploadId are required");
            }
            Long requesterUserId = principal.getUsers().getId();
            ModelUpload artifactUpload = modelUploadService.requireCompleted(request.artifactUploadId(), requesterUserId);
            ModelUpload manifestUpload = modelUploadService.requireCompleted(request.manifestUploadId(), requesterUserId);
            ModelArtifact artifact = new ModelArtifact(
                request.version(), requesterUserId, artifactUpload.getObjectKey(), artifactUpload.getObservedSha256(), request.codeCommit(),
                request.dataManifestHash(), request.configHash(), request.featureSchemaVersion(), manifestUpload.getObjectKey(),
                manifestUpload.getObservedSha256(), ModelArtifactState.DRAFT, OffsetDateTime.now()
            );
            List<ModelRegistryService.EvaluationInput> evaluations = request.evaluations() == null ? null
                : request.evaluations().stream().map(row -> row == null ? null : new ModelRegistryService.EvaluationInput(
                    row.horizonMinutes(), row.requiredBikeCount(), row.sampleCount(), row.brierScore(),
                    row.shortageRecall(), row.calibrationError(), row.coverage(), row.monotonicityViolations()
                )).toList();
            ModelArtifact saved = modelRegistryService.registerDraft(artifact, evaluations);
            audit(principal, "MODEL_REGISTER", saved.getVersion(), AuditResult.SUCCESS, null);
            return ResponseEntity.status(HttpStatus.CREATED).body(ModelOpsDtos.ModelResponse.from(saved));
        } catch (RuntimeException error) {
            audit(principal, "MODEL_REGISTER", safeTarget(request.version()), AuditResult.FAILURE, uploadReason(error));
            throw error;
        }
    }

    @PostMapping("/models/reconcile-runtime")
    @PreAuthorize("hasAuthority('MODEL_ACTIVATE')")
    public ModelOpsDtos.ModelResponse reconcileRuntime(@AuthenticationPrincipal PrincipalDetails principal) {
        try {
            ModelArtifact reconciled = runtimeModelRegistryService.reconcile();
            audit(principal, "MODEL_RUNTIME_RECONCILE", reconciled.getVersion(), AuditResult.SUCCESS, null);
            return ModelOpsDtos.ModelResponse.from(reconciled);
        } catch (RuntimeException error) {
            audit(principal, "MODEL_RUNTIME_RECONCILE", "RUNTIME_MODEL", AuditResult.FAILURE, "MODEL_RUNTIME_RECONCILE_FAILED");
            throw error;
        }
    }

    @PostMapping("/models/{id}/validate")
    @PreAuthorize("hasAuthority('MODEL_VALIDATE')")
    public ModelOpsDtos.ModelResponse validate(@PathVariable Long id, @AuthenticationPrincipal PrincipalDetails principal) {
        return transition(id, ModelArtifactState.VALIDATED, principal, "MODEL_VALIDATE");
    }

    @PostMapping("/models/{id}/approve")
    @PreAuthorize("hasAuthority('MODEL_APPROVE')")
    public ModelOpsDtos.ModelResponse approve(@PathVariable Long id, @AuthenticationPrincipal PrincipalDetails principal) {
        return transition(id, ModelArtifactState.APPROVED, principal, "MODEL_APPROVE");
    }

    @PostMapping("/models/{id}/reject")
    @PreAuthorize("hasAuthority('MODEL_APPROVE')")
    public ModelOpsDtos.ModelResponse reject(@PathVariable Long id, @AuthenticationPrincipal PrincipalDetails principal) {
        return transition(id, ModelArtifactState.REJECTED, principal, "MODEL_REJECT");
    }

    @GetMapping("/models")
    @PreAuthorize("hasAuthority('MODEL_METRICS_READ')")
    public List<ModelOpsDtos.ModelResponse> getModels() {
        return modelRegistryService.findAll().stream().map(ModelOpsDtos.ModelResponse::from).toList();
    }

    @GetMapping("/models/history")
    @PreAuthorize("hasAuthority('MODEL_RELEASE_READ')")
    public List<ModelOpsDtos.HistoryResponse> getHistory() {
        return modelHistoryRepository.findRecent();
    }

    @GetMapping("/models/{id}/metrics")
    @PreAuthorize("hasAnyAuthority('MODEL_METRICS_READ','MODEL_DIAGNOSTICS_READ')")
    public ModelOpsDtos.MetricsResponse getMetrics(@PathVariable Long id) {
        return new ModelOpsDtos.MetricsResponse(
            id,
            modelRegistryService.findEvaluations(id).stream().map(ModelOpsDtos.MetricResponse::from).toList()
        );
    }

    @PostMapping("/models/{id}/activate")
    @PreAuthorize("hasAuthority('MODEL_ACTIVATE')")
    public ModelOpsDtos.ActivationResponse activate(@PathVariable Long id, @AuthenticationPrincipal PrincipalDetails principal) {
        return ModelOpsDtos.ActivationResponse.from(modelActivationService.activate(id, principal.getUsers().getId(),
                principal.getUsers().getRole(), auditRoles(principal)));
    }

    @PostMapping("/models/rollback")
    @PreAuthorize("hasAuthority('MODEL_ROLLBACK')")
    public ModelOpsDtos.ActivationResponse rollback(@AuthenticationPrincipal PrincipalDetails principal) {
        return ModelOpsDtos.ActivationResponse.from(modelActivationService.rollback(principal.getUsers().getId(),
                principal.getUsers().getRole(), auditRoles(principal)));
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    ResponseEntity<ModelOpsDtos.ErrorResponse> validation(Exception ignored) { return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "입력값이 올바르지 않습니다."); }
    @ExceptionHandler(ModelActivationService.PromotionGateException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> promotionGate(ModelActivationService.PromotionGateException ignored) { return error(HttpStatus.CONFLICT, "MODEL_PROMOTION_GATE_FAILED", "활성화 조건을 충족하지 않습니다."); }
    @ExceptionHandler(ModelActivationService.RollbackTargetUnavailableException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> rollbackTarget(ModelActivationService.RollbackTargetUnavailableException ignored) { return error(HttpStatus.CONFLICT, "ROLLBACK_TARGET_UNAVAILABLE", "복원할 모델이 없습니다."); }
    @ExceptionHandler(ModelActivationService.CompensationFailedException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> compensation(ModelActivationService.CompensationFailedException ignored) { return error(HttpStatus.SERVICE_UNAVAILABLE, "COMPENSATION_FAILED", "모델 복원에 실패했습니다."); }
    @ExceptionHandler(ModelActivationService.ActivationFailedException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> activation(ModelActivationService.ActivationFailedException ignored) { return error(HttpStatus.SERVICE_UNAVAILABLE, "MODEL_ACTIVATION_FAILED", "모델 전환에 실패했습니다."); }
    @ExceptionHandler(ModelRegistryService.MakerCheckerViolationException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> makerChecker(ModelRegistryService.MakerCheckerViolationException ignored) { return error(HttpStatus.CONFLICT, "MODEL_PROMOTION_GATE_FAILED", "등록·검증 담당자와 승인 담당자는 달라야 합니다."); }
    @ExceptionHandler({RuntimeModelRegistryService.RuntimeMismatchException.class, com.ddarungflow.modelops.RuntimeModelSourceGateway.UnavailableException.class})
    ResponseEntity<ModelOpsDtos.ErrorResponse> runtimeReconcile(RuntimeException ignored) { return error(HttpStatus.CONFLICT, "MODEL_RUNTIME_RECONCILE_FAILED", "현재 serving 모델을 registry와 안전하게 동기화할 수 없습니다."); }
    @ExceptionHandler(ModelUploadService.UploadConflictException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> uploadConflict(ModelUploadService.UploadConflictException error) { return error(HttpStatus.CONFLICT, error.code(), "업로드 상태가 현재 요청과 맞지 않습니다."); }
    @ExceptionHandler(ModelUploadService.UploadIntegrityException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> uploadIntegrity(ModelUploadService.UploadIntegrityException error) { return error(HttpStatus.UNPROCESSABLE_ENTITY, error.code(), "업로드 파일의 무결성을 확인할 수 없습니다."); }
    @ExceptionHandler(ModelUploadService.StorageUnavailableException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> uploadStorage(ModelUploadService.StorageUnavailableException ignored) { return error(HttpStatus.SERVICE_UNAVAILABLE, "MODEL_UPLOAD_STORAGE_UNAVAILABLE", "모델 저장소를 사용할 수 없습니다."); }
    @ExceptionHandler(ModelUploadService.UploadOwnershipException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> uploadOwnership(ModelUploadService.UploadOwnershipException ignored) { return error(HttpStatus.FORBIDDEN, "MODEL_UPLOAD_OWNER_MISMATCH", "다른 사용자의 업로드는 모델 등록에 사용할 수 없습니다."); }
    @ExceptionHandler(IllegalStateException.class)
    ResponseEntity<ModelOpsDtos.ErrorResponse> lifecycleConflict(IllegalStateException ignored) { return error(HttpStatus.CONFLICT, "MODEL_LIFECYCLE_CONFLICT", "현재 모델 상태에서는 요청을 수행할 수 없습니다."); }
    private ResponseEntity<ModelOpsDtos.ErrorResponse> error(HttpStatus status, String code, String message) { return ResponseEntity.status(status).body(new ModelOpsDtos.ErrorResponse(code, message)); }

    private ModelOpsDtos.ModelResponse transition(Long id, ModelArtifactState target, PrincipalDetails principal, String action) {
        String targetVersion;
        try {
            targetVersion = modelRegistryService.findById(id).getVersion();
        } catch (RuntimeException ignored) {
            targetVersion = "MODEL_NOT_FOUND";
        }
        try {
            ModelArtifact changed = modelRegistryService.transition(id, target, principal.getUsers().getId());
            audit(principal, action, changed.getVersion(), AuditResult.SUCCESS, null);
            return ModelOpsDtos.ModelResponse.from(changed);
        } catch (ModelRegistryService.MakerCheckerViolationException error) {
            audit(principal, action, targetVersion, AuditResult.FAILURE, "MAKER_CHECKER_REQUIRED");
            throw error;
        } catch (RuntimeException error) {
            audit(principal, action, targetVersion, AuditResult.FAILURE, "MODEL_PROMOTION_GATE_FAILED");
            throw error;
        }
    }

    private void audit(PrincipalDetails principal, String action, String target, AuditResult result, String reasonCode) {
        auditEventService.appendEvent(principal.getUsers().getId(), principal.getUsers().getRole(), auditRoles(principal),
                action, "MODEL", target, result, reasonCode, null, UUID.randomUUID().toString(), OffsetDateTime.now());
    }

    private void auditUpload(PrincipalDetails principal, String action, UUID uploadId, AuditResult result, String reasonCode) {
        auditEventService.appendEvent(principal.getUsers().getId(), principal.getUsers().getRole(), auditRoles(principal),
                action, "MODEL_UPLOAD", uploadId.toString(), result, reasonCode, null,
                UUID.randomUUID().toString(), OffsetDateTime.now());
    }

    private String uploadReason(RuntimeException error) {
        if (error instanceof ModelUploadService.UploadConflictException conflict) return conflict.code();
        if (error instanceof ModelUploadService.UploadIntegrityException integrity) return integrity.code();
        if (error instanceof ModelUploadService.StorageUnavailableException) return "MODEL_UPLOAD_STORAGE_UNAVAILABLE";
        if (error instanceof ModelUploadService.UploadOwnershipException) return "MODEL_UPLOAD_OWNER_MISMATCH";
        return "VALIDATION_ERROR";
    }

    private java.util.Collection<?> auditRoles(PrincipalDetails principal) {
        return principal.getAdminRoles().isEmpty() ? List.of(principal.getUsers().getRole()) : principal.getAdminRoles();
    }

    private String safeTarget(String version) {
        return version == null || version.isBlank() ? "MODEL_UNSPECIFIED" : version;
    }
}
