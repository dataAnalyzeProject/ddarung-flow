package com.ddarungflow.dto;

import com.ddarungflow.audit.AuditResult;

import java.time.OffsetDateTime;
import java.util.List;

public final class AdminSystemAuditLogDtos {
    private AdminSystemAuditLogDtos() { }

    public record AuditLogItem(String action, String targetType, List<String> actorRoleCodes,
                               AuditResult result, String reasonCode, OffsetDateTime occurredAt) { }

    public record PageResponse(List<AuditLogItem> items, int page, int size, long total) { }

    public record ErrorResponse(String code, String message) { }
}
