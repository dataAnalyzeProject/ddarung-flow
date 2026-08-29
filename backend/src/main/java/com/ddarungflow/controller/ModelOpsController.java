package com.ddarungflow.controller;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.ModelOpsDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.modelops.ModelArtifact;
import com.ddarungflow.modelops.ModelArtifactState;
import com.ddarungflow.modelops.ModelActivationService;
import com.ddarungflow.modelops.ModelRegistryService;
import com.ddarungflow.modelops.ModelUpload;
import com.ddarungflow.modelops.ModelUploadService;
import com.ddarungflow.modelops.ModelUploadStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ExceptionHandler;

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

    public ModelOpsController(ModelRegistryService modelRegistryService, ModelUploadService modelUploadService,
                              ModelActivationService modelActivationService, AuditEventService auditEventService) {
        this.modelRegistryService = modelRegistryService;
        this.modelUploadService = modelUploadService;
        this.modelActivationService = modelActivationService;
        this.auditEventService = auditEventService;
    }

    @PostMapping("/model-uploads")
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ResponseEntity<ModelOpsDtos.UploadResponse> createUpload(
        @RequestBody ModelOpsDtos.CreateUploadRequest request,
        @AuthenticationPrincipal PrincipalDetails principal
    ) {
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(
            UUID.randomUUID(), principal.getUsers().getId(), request.objectKey(), request.expectedSha256(),
            request.maxBytes(), ModelUploadStatus.CREATED, request.expiresAt(), null, now
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(ModelOpsDtos.UploadResponse.from(modelUploadService.createUpload(upload)));
    }

    @PostMapping("/model-uploads/{id}/complete")
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ModelOpsDtos.UploadResponse completeUpload(@PathVariable UUID id) {
        return ModelOpsDtos.UploadResponse.from(modelUploadService.complete(id, OffsetDateTime.now()));
    }

    @PostMapping("/models")
    @PreAuthorize("hasAuthority('MODEL_ARTIFACT_REGISTER')")
    public ResponseEntity<ModelOpsDtos.ModelResponse> createModel(
        @RequestBody ModelOpsDtos.CreateModelRequest request,
        @AuthenticationPrincipal PrincipalDetails principal
    ) {
        ModelArtifact artifact = new ModelArtifact(
            request.version(), principal.getUsers().getId(), request.artifactKey(), request.sha256(), request.codeCommit(),
            request.dataManifestHash(), request.configHash(), request.featureSchemaVersion(), request.manifestKey(),
            request.manifestSha256(), ModelArtifactState.DRAFT, OffsetDateTime.now()
        );
        try {
            ModelArtifact saved = modelRegistryService.registerDraft(artifact);
            audit(principal, "MODEL_REGISTER", saved.getVersion(), AuditResult.SUCCESS, null);
            return ResponseEntity.status(HttpStatus.CREATED).body(ModelOpsDtos.ModelResponse.from(saved));
        } catch (RuntimeException error) {
            audit(principal, "MODEL_REGISTER", safeTarget(request.version()), AuditResult.FAILURE, "VALIDATION_ERROR");
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

    private java.util.Collection<?> auditRoles(PrincipalDetails principal) {
        return principal.getAdminRoles().isEmpty() ? List.of(principal.getUsers().getRole()) : principal.getAdminRoles();
    }

    private String safeTarget(String version) {
        return version == null || version.isBlank() ? "MODEL_UNSPECIFIED" : version;
    }
}
