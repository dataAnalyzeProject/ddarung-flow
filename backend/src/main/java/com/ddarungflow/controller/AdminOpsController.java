package com.ddarungflow.controller;

import com.ddarungflow.admin.operations.AdminOpsDtos;
import com.ddarungflow.admin.operations.AdminOpsReadService;
import com.ddarungflow.admin.operations.AdminOpsRiskSnapshotService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/admin/ops")
public class AdminOpsController {
    private final AdminOpsReadService service;
    public AdminOpsController(AdminOpsReadService service) { this.service = service; }

    @GetMapping("/overview")
    @PreAuthorize("hasAuthority('OPS_DASHBOARD_READ')")
    public AdminOpsDtos.OverviewResponse overview(@RequestParam(defaultValue = "60") int horizonMinutes,
                                                    @RequestParam(required = false) Integer requiredBikeCount,
                                                    @RequestParam(required = false) String snapshotId) {
        return service.overview(OffsetDateTime.now(), horizon(horizonMinutes), required(requiredBikeCount), snapshotId);
    }
    @GetMapping("/risk-stations")
    @PreAuthorize("hasAuthority('OPS_RISK_MAP_READ')")
    public AdminOpsDtos.RiskStationListResponse list(@RequestParam(defaultValue = "60") int horizonMinutes,
                                                       @RequestParam(required = false) Integer requiredBikeCount,
                                                       @RequestParam(required = false) String bbox,
                                                       @RequestParam(required = false) String dataState,
                                                       @RequestParam(defaultValue = "100") int limit,
                                                       @RequestParam(required = false) String cursor,
                                                       @RequestParam(required = false) String snapshotId) {
        BigDecimal[] bounds = bbox(bbox);
        if (bounds[0] == null && (cursor == null || cursor.isBlank()) && (snapshotId == null || snapshotId.isBlank())) throw new IllegalArgumentException("bbox");
        String normalizedState = state(dataState);
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("limit");
        return service.list(OffsetDateTime.now(), horizon(horizonMinutes), required(requiredBikeCount), bounds[0], bounds[1], bounds[2], bounds[3], normalizedState, limit, cursor, snapshotId);
    }
    @GetMapping("/risk-stations/{stationNumber}")
    @PreAuthorize("hasAuthority('OPS_RISK_MAP_READ')")
    public AdminOpsDtos.RiskStationDetailResponse detail(@PathVariable String stationNumber,
                                                           @RequestParam(defaultValue = "60") int horizonMinutes,
                                                           @RequestParam(required = false) Integer requiredBikeCount,
                                                           @RequestParam(required = false) String snapshotId) {
        return service.detail(OffsetDateTime.now(), horizon(horizonMinutes), required(requiredBikeCount), stationNumber, snapshotId);
    }
    private int horizon(int value) { if (value != 60 && value != 120 && value != 180 && value != 240) throw new UnsupportedHorizonException(); return value; }
    private int required(Integer value) { int result = value == null ? 1 : value; if (result < 1 || result > 5) throw new IllegalArgumentException("requiredBikeCount"); return result; }
    private String state(String value) { if (value == null || value.isBlank()) return null; try { return switch (value) { case "NORMAL", "DELAYED", "MISSING", "INSUFFICIENT_DATA", "UNAVAILABLE" -> value; default -> throw new IllegalArgumentException("dataState"); }; } catch (IllegalArgumentException error) { throw error; } }
    private BigDecimal[] bbox(String value) {
        if (value == null || value.isBlank()) return new BigDecimal[] {null, null, null, null};
        try {
            String[] parts = value.split(",", -1); if (parts.length != 4) throw new IllegalArgumentException("bbox");
            BigDecimal minLng = new BigDecimal(parts[0]); BigDecimal minLat = new BigDecimal(parts[1]); BigDecimal maxLng = new BigDecimal(parts[2]); BigDecimal maxLat = new BigDecimal(parts[3]);
            if (minLng.compareTo(maxLng) >= 0 || minLat.compareTo(maxLat) >= 0 || minLng.compareTo(new BigDecimal("-180")) < 0 || maxLng.compareTo(new BigDecimal("180")) > 0 || minLat.compareTo(new BigDecimal("-90")) < 0 || maxLat.compareTo(new BigDecimal("90")) > 0) throw new IllegalArgumentException("bbox");
            return new BigDecimal[] {minLng, minLat, maxLng, maxLat};
        } catch (NumberFormatException error) { throw new IllegalArgumentException("bbox"); }
    }
    @ExceptionHandler(UnsupportedHorizonException.class)
    ResponseEntity<AdminOpsDtos.ErrorResponse> unsupported() { return error(HttpStatus.BAD_REQUEST, "UNSUPPORTED_HORIZON"); }
    @ExceptionHandler(AdminOpsReadService.NotFoundException.class)
    ResponseEntity<AdminOpsDtos.ErrorResponse> missing() { return error(HttpStatus.NOT_FOUND, "ADMIN_OPS_STATION_NOT_FOUND"); }
    @ExceptionHandler(AdminOpsReadService.ScopeTooLargeException.class)
    ResponseEntity<AdminOpsDtos.ErrorResponse> scopeTooLarge() { return error(HttpStatus.CONFLICT, "RISK_SCOPE_TOO_LARGE"); }
    @ExceptionHandler(AdminOpsReadService.InferenceUnavailableException.class)
    ResponseEntity<AdminOpsDtos.ErrorResponse> inferenceUnavailable() { return error(HttpStatus.SERVICE_UNAVAILABLE, "OPS_RISK_INFERENCE_UNAVAILABLE"); }
    @ExceptionHandler(AdminOpsReadService.InferenceOverloadedException.class)
    ResponseEntity<AdminOpsDtos.ErrorResponse> inferenceOverloaded() { return error(HttpStatus.SERVICE_UNAVAILABLE, "OPS_RISK_INFERENCE_OVERLOADED"); }
    @ExceptionHandler({AdminOpsRiskSnapshotService.ExpiredSnapshotException.class})
    ResponseEntity<AdminOpsDtos.ErrorResponse> expiredSnapshot() { return error(HttpStatus.CONFLICT, "RISK_SNAPSHOT_EXPIRED"); }
    @ExceptionHandler({AdminOpsRiskSnapshotService.UnknownSnapshotException.class, AdminOpsReadService.InvalidCursorException.class})
    ResponseEntity<AdminOpsDtos.ErrorResponse> invalidSnapshot() { return error(HttpStatus.BAD_REQUEST, "RISK_SNAPSHOT_INVALID"); }
    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<AdminOpsDtos.ErrorResponse> invalid() { return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR"); }
    private ResponseEntity<AdminOpsDtos.ErrorResponse> error(HttpStatus status, String code) { return ResponseEntity.status(status).body(new AdminOpsDtos.ErrorResponse(code, "입력값이 올바르지 않습니다.")); }
    private static class UnsupportedHorizonException extends RuntimeException { }
}
