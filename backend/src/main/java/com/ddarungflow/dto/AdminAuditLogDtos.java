package com.ddarungflow.dto;

import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.entity.UserRole;

import java.time.OffsetDateTime;
import java.util.List;

public final class AdminAuditLogDtos {
    private AdminAuditLogDtos() { }

    public record AuditLogResponse(String action, String targetType, String targetId, UserRole actorRole,
                                   AuditResult result, String reasonCode, String correlationId,
                                   OffsetDateTime occurredAt, String targetPublicId,
                                   List<String> actorRoleCodes) { }

    public record PageResponse(List<AuditLogResponse> items, int page, int size, long total) { }

    public record ErrorResponse(String code, String message) { }
}
