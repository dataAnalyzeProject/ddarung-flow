package com.ddarungflow.service;

import com.ddarungflow.audit.AuditEvent;
import com.ddarungflow.audit.AuditEventRepository;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminAuditLogDtos;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminAuditLogQueryService {
    private static final int MAX_PAGE_SIZE = 100;

    private final AuditEventRepository auditEventRepository;

    public AdminAuditLogDtos.PageResponse list(String action, AuditResult result, String reasonCode,
                                                OffsetDateTime from, OffsetDateTime to, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE || (from != null && to != null && from.isAfter(to))) {
            throw new IllegalArgumentException("감사 로그 조회 입력값이 올바르지 않습니다.");
        }
        Page<AuditEvent> events = auditEventRepository.findAuditLogs(
                trimToNull(action), result, trimToNull(reasonCode), from, to,
                PageRequest.of(page, size, Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id"))));
        return new AdminAuditLogDtos.PageResponse(events.getContent().stream().map(this::response).toList(),
                page, size, events.getTotalElements());
    }

    private AdminAuditLogDtos.AuditLogResponse response(AuditEvent event) {
        return new AdminAuditLogDtos.AuditLogResponse(event.getAction(), event.getTargetType(), event.getTargetId(),
                event.getActorRole(), event.getResult(), event.getReasonCode(), event.getCorrelationId(),
                event.getOccurredAt());
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
