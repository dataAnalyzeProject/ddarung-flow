package com.ddarungflow.controller;

import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminSystemAuditLogDtos;
import com.ddarungflow.service.AdminAuditLogQueryService;
import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/system/audit-logs")
public class AdminSystemAuditLogsController {
    private final AdminAuditLogQueryService adminAuditLogQueryService;

    @GetMapping
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public AdminSystemAuditLogDtos.PageResponse list(@RequestParam(required = false) String action,
                                                      @RequestParam(required = false) AuditResult result,
                                                      @RequestParam(required = false) String reasonCode,
                                                      @RequestParam(required = false) OffsetDateTime from,
                                                      @RequestParam(required = false) OffsetDateTime to,
                                                      @RequestParam(defaultValue = "0") int page,
                                                      @RequestParam(defaultValue = "20") int size) {
        return adminAuditLogQueryService.listSystem(action, result, reasonCode, from, to, page, size);
    }

    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<AdminSystemAuditLogDtos.ErrorResponse> invalidRequest(Exception error) {
        return ResponseEntity.badRequest()
                .body(new AdminSystemAuditLogDtos.ErrorResponse("VALIDATION_ERROR", "입력값이 올바르지 않습니다."));
    }
}
