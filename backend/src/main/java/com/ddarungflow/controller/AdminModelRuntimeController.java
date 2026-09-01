package com.ddarungflow.controller;

import com.ddarungflow.dto.AdminModelRuntimeDtos;
import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/model-runtime")
public class AdminModelRuntimeController {
    private final InferenceClient inferenceClient;

    public AdminModelRuntimeController(InferenceClient inferenceClient) {
        this.inferenceClient = inferenceClient;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('MODEL_METRICS_READ')")
    public AdminModelRuntimeDtos.Response get() {
        InferenceDtos.RuntimeModelResponse runtime = inferenceClient.runtimeModel();
        return new AdminModelRuntimeDtos.Response(
            runtime.status(), runtime.modelVersion(), runtime.artifactSha256(), runtime.modelSource(), runtime.loadedAt(),
            runtime.supportedHorizons(), runtime.supportedQuantities()
        );
    }

    @ExceptionHandler(IllegalStateException.class)
    ResponseEntity<AdminModelRuntimeDtos.ErrorResponse> unavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(new AdminModelRuntimeDtos.ErrorResponse("MODEL_RUNTIME_UNAVAILABLE", "실시간 inference 모델 정보를 확인할 수 없습니다."));
    }
}
