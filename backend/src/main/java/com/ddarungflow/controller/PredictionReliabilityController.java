package com.ddarungflow.controller;

import com.ddarungflow.dto.PredictionReliabilityDtos;
import com.ddarungflow.prediction.PredictionReliabilityService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/prediction-reliability")
public class PredictionReliabilityController {
    private final PredictionReliabilityService service;

    public PredictionReliabilityController(PredictionReliabilityService service) {
        this.service = service;
    }

    @GetMapping
    public PredictionReliabilityDtos.Response get(
            @RequestParam int horizonMinutes,
            @RequestParam int requiredBikeCount,
            @RequestParam(required = false) String stationId,
            @RequestParam Double probability
    ) {
        return service.find(horizonMinutes, requiredBikeCount, probability);
    }

    @ExceptionHandler(PredictionReliabilityService.ReliabilityNotAvailableException.class)
    ResponseEntity<PredictionReliabilityDtos.ErrorResponse> unavailable() {
        return error(HttpStatus.NOT_FOUND, "RELIABILITY_NOT_AVAILABLE", "예측 신뢰도 평가를 찾을 수 없습니다.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<PredictionReliabilityDtos.ErrorResponse> invalidRequest() {
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.");
    }

    private ResponseEntity<PredictionReliabilityDtos.ErrorResponse> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(new PredictionReliabilityDtos.ErrorResponse(code, message));
    }
}
