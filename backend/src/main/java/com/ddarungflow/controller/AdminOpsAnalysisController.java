package com.ddarungflow.controller;

import com.ddarungflow.admin.operations.AdminOpsAnalysisDtos;
import com.ddarungflow.admin.operations.AdminOpsAnalysisService;
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
@RequestMapping("/api/v1/admin/ops/analysis")
public class AdminOpsAnalysisController {
    private final AdminOpsAnalysisService service;
    public AdminOpsAnalysisController(AdminOpsAnalysisService service) { this.service = service; }
    @GetMapping @PreAuthorize("hasAuthority('OPS_ANALYSIS_READ')")
    public AdminOpsAnalysisDtos.Response analysis(@RequestParam(defaultValue = "WEEKDAY") String view, @RequestParam(defaultValue = "RENTAL") String riskType,
                                                    @RequestParam(required = false) String district, @RequestParam(required = false) String period, @RequestParam(required = false) String dimension,
                                                    @RequestParam(required = false) Integer horizonMinutes, @RequestParam(required = false) Integer requiredBikeCount) {
        if (!"WEEKDAY".equals(view) && !"HOUR".equals(view)) throw new UnsupportedViewException();
        if (!"RENTAL".equals(riskType)) throw new UnsupportedRiskTypeException();
        if (district != null || period != null || dimension != null || horizonMinutes != null || requiredBikeCount != null) throw new IllegalArgumentException("deferred parameter");
        return service.analyze(OffsetDateTime.now(), view, riskType);
    }
    @ExceptionHandler(UnsupportedViewException.class) ResponseEntity<AdminOpsDtos.ErrorResponse> view() { return error("UNSUPPORTED_ANALYSIS_VIEW"); }
    @ExceptionHandler(UnsupportedRiskTypeException.class) ResponseEntity<AdminOpsDtos.ErrorResponse> riskType() { return error("UNSUPPORTED_RISK_TYPE"); }
    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentTypeMismatchException.class}) ResponseEntity<AdminOpsDtos.ErrorResponse> invalid() { return error("VALIDATION_ERROR"); }
    private ResponseEntity<AdminOpsDtos.ErrorResponse> error(String code) { return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new AdminOpsDtos.ErrorResponse(code, "입력값이 올바르지 않습니다.")); }
    private static class UnsupportedViewException extends RuntimeException { }
    private static class UnsupportedRiskTypeException extends RuntimeException { }
}
