package com.ddarungflow.controller;

import com.ddarungflow.admin.operations.AdminOpsCandidateDtos;
import com.ddarungflow.admin.operations.AdminOpsCandidateService;
import com.ddarungflow.admin.operations.AdminOpsDtos;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/admin/ops/candidates")
public class AdminOpsCandidatesController {
    private final AdminOpsCandidateService service;
    public AdminOpsCandidatesController(AdminOpsCandidateService service) { this.service = service; }
    @GetMapping @PreAuthorize("hasAuthority('OPS_CANDIDATE_READ')")
    public AdminOpsCandidateDtos.Response candidates(@RequestParam(defaultValue = "60") int horizonMinutes, @RequestParam(required = false) Integer requiredBikeCount,
                                                       @RequestParam(defaultValue = "RENTAL") String riskType, @RequestParam(defaultValue = "100") int limit,
                                                       @RequestParam(required = false) String cursor) {
        if (horizonMinutes != 60 && horizonMinutes != 120 && horizonMinutes != 180 && horizonMinutes != 240) throw new UnsupportedHorizonException();
        if (requiredBikeCount != null && (requiredBikeCount < 1 || requiredBikeCount > 5) || limit < 1 || limit > 500) throw new IllegalArgumentException("validation");
        if (!"RENTAL".equals(riskType)) throw new UnsupportedRiskTypeException();
        return service.list(OffsetDateTime.now(), horizonMinutes, requiredBikeCount == null ? 1 : requiredBikeCount, riskType, limit, cursor);
    }
    @ExceptionHandler(UnsupportedHorizonException.class) ResponseEntity<AdminOpsDtos.ErrorResponse> horizon() { return error("UNSUPPORTED_HORIZON"); }
    @ExceptionHandler(UnsupportedRiskTypeException.class) ResponseEntity<AdminOpsDtos.ErrorResponse> riskType() { return error("UNSUPPORTED_RISK_TYPE"); }
    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentTypeMismatchException.class}) ResponseEntity<AdminOpsDtos.ErrorResponse> invalid() { return error("VALIDATION_ERROR"); }
    private ResponseEntity<AdminOpsDtos.ErrorResponse> error(String code) { return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new AdminOpsDtos.ErrorResponse(code, "입력값이 올바르지 않습니다.")); }
    private static class UnsupportedHorizonException extends RuntimeException { }
    private static class UnsupportedRiskTypeException extends RuntimeException { }
}
