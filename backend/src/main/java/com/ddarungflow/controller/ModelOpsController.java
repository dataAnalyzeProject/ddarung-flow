package com.ddarungflow.controller;

import com.ddarungflow.dto.ModelOpsDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.modelops.ModelArtifact;
import com.ddarungflow.modelops.ModelArtifactState;
import com.ddarungflow.modelops.ModelRegistryService;
import com.ddarungflow.modelops.ModelUpload;
import com.ddarungflow.modelops.ModelUploadService;
import com.ddarungflow.modelops.ModelUploadStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
public class ModelOpsController {

    private final ModelRegistryService modelRegistryService;
    private final ModelUploadService modelUploadService;

    public ModelOpsController(ModelRegistryService modelRegistryService, ModelUploadService modelUploadService) {
        this.modelRegistryService = modelRegistryService;
        this.modelUploadService = modelUploadService;
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
            request.dataManifestHash(), request.configHash(), request.featureSchemaVersion(), ModelArtifactState.DRAFT, OffsetDateTime.now()
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

    private ModelOpsDtos.ModelResponse transition(Long id, ModelArtifactState target) {
        return ModelOpsDtos.ModelResponse.from(modelRegistryService.transition(id, target));
    }
}
