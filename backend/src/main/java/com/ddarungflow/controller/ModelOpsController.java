package com.ddarungflow.controller;

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

    public ModelOpsController(ModelRegistryService modelRegistryService, ModelUploadService modelUploadService,
                              ModelActivationService modelActivationService) {
        this.modelRegistryService = modelRegistryService;
        this.modelUploadService = modelUploadService;
        this.modelActivationService = modelActivationService;
    }

    @PostMapping("/model-uploads")
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
    public ModelOpsDtos.UploadResponse completeUpload(@PathVariable UUID id) {
        return ModelOpsDtos.UploadResponse.from(modelUploadService.complete(id, OffsetDateTime.now()));
    }

    @PostMapping("/models")
    public ResponseEntity<ModelOpsDtos.ModelResponse> createModel(
        @RequestBody ModelOpsDtos.CreateModelRequest request,
        @AuthenticationPrincipal PrincipalDetails principal
    ) {
        ModelArtifact artifact = new ModelArtifact(
            request.version(), principal.getUsers().getId(), request.artifactKey(), request.sha256(), request.codeCommit(),
            request.dataManifestHash(), request.configHash(), request.featureSchemaVersion(), request.manifestKey(),
            request.manifestSha256(), ModelArtifactState.DRAFT, OffsetDateTime.now()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(ModelOpsDtos.ModelResponse.from(modelRegistryService.registerDraft(artifact)));
    }

    @PostMapping("/models/{id}/validate")
    public ModelOpsDtos.ModelResponse validate(@PathVariable Long id) {
        return transition(id, ModelArtifactState.VALIDATED);
    }

    @PostMapping("/models/{id}/approve")
    public ModelOpsDtos.ModelResponse approve(@PathVariable Long id) {
        return transition(id, ModelArtifactState.APPROVED);
    }

    @PostMapping("/models/{id}/reject")
    public ModelOpsDtos.ModelResponse reject(@PathVariable Long id) {
        return transition(id, ModelArtifactState.REJECTED);
    }

    @GetMapping("/models")
    public List<ModelOpsDtos.ModelResponse> getModels() {
        return modelRegistryService.findAll().stream().map(ModelOpsDtos.ModelResponse::from).toList();
    }

    @GetMapping("/models/{id}/metrics")
    public ModelOpsDtos.MetricsResponse getMetrics(@PathVariable Long id) {
        return new ModelOpsDtos.MetricsResponse(
            id,
            modelRegistryService.findEvaluations(id).stream().map(ModelOpsDtos.MetricResponse::from).toList()
        );
    }

    @PostMapping("/models/{id}/activate")
    public ModelOpsDtos.ActivationResponse activate(@PathVariable Long id, @AuthenticationPrincipal PrincipalDetails principal) {
        return ModelOpsDtos.ActivationResponse.from(modelActivationService.activate(id, principal.getUsers().getId(), principal.getUsers().getRole()));
    }

    @PostMapping("/models/rollback")
    public ModelOpsDtos.ActivationResponse rollback(@AuthenticationPrincipal PrincipalDetails principal) {
        return ModelOpsDtos.ActivationResponse.from(modelActivationService.rollback(principal.getUsers().getId(), principal.getUsers().getRole()));
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
    private ResponseEntity<ModelOpsDtos.ErrorResponse> error(HttpStatus status, String code, String message) { return ResponseEntity.status(status).body(new ModelOpsDtos.ErrorResponse(code, message)); }

    private ModelOpsDtos.ModelResponse transition(Long id, ModelArtifactState target) {
        return ModelOpsDtos.ModelResponse.from(modelRegistryService.transition(id, target));
    }
}
