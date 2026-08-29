package com.ddarungflow.audit;

import com.ddarungflow.entity.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Collection;
import java.util.Comparator;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuditEventService {

    private final AuditEventRepository auditEventRepository;

    @Transactional
    public AuditEvent appendEvent(Long actorUserId, UserRole actorRole, String action, String targetType,
                                   String targetId, AuditResult result, String reasonCode, String correlationId,
                                   OffsetDateTime occurredAt) {
        return appendEvent(actorUserId, actorRole, actorRole == null ? List.of() : List.of(actorRole), action, targetType, targetId, result,
                reasonCode, null, correlationId, occurredAt);
    }

    @Transactional
    public AuditEvent appendEvent(Long actorUserId, UserRole actorRole, Collection<?> actorRoleCodes,
                                  String action, String targetType, String targetId, AuditResult result,
                                  String reasonCode, String reason, String correlationId,
                                  OffsetDateTime occurredAt) {
        if (actorUserId == null || action == null || action.isBlank() || targetType == null || targetType.isBlank()
                || targetId == null || targetId.isBlank() || result == null || correlationId == null || correlationId.isBlank()) {
            throw new IllegalArgumentException("필수 감사 이벤트 정보가 누락되었습니다.");
        }

        // actorRole은 USER 또는 ADMIN만 허용
        if (actorRole == null || (actorRole != UserRole.USER && actorRole != UserRole.ADMIN)) {
            throw new IllegalArgumentException("허용되지 않은 감사 입력 역할입니다: " + actorRole);
        }
        if (actorRoleCodes == null || actorRoleCodes.isEmpty()) {
            throw new IllegalArgumentException("감사 actorRoleCodes는 필수입니다.");
        }
        if (reason != null && (reason.trim().length() < 2 || reason.trim().length() > 200)) {
            throw new IllegalArgumentException("감사 사유는 2~200자여야 합니다.");
        }
        String roleCodes = actorRoleCodes.stream().map(Object::toString).sorted(Comparator.naturalOrder())
                .reduce((left, right) -> left + "," + right).orElseThrow();

        // (correlationId, action, targetType, targetId) 중복 거부
        if (auditEventRepository.existsByCorrelationIdAndActionAndTargetTypeAndTargetId(correlationId, action, targetType, targetId)) {
            throw new IllegalStateException("중복된 감사 이벤트 키입니다: " + correlationId + ", " + action + ", " + targetType + ", " + targetId);
        }

        AuditEvent event = AuditEvent.builder()
                .actorUserId(actorUserId)
                .actorRole(actorRole)
                .actorRoleCodes(roleCodes)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .result(result)
                .reasonCode(reasonCode)
                .reason(reason == null ? null : reason.trim())
                .correlationId(correlationId)
                .occurredAt(occurredAt != null ? occurredAt : OffsetDateTime.now())
                .build();

        return auditEventRepository.save(event);
    }

    public List<AuditEvent> getEventsByCorrelationId(String correlationId) {
        if (correlationId == null || correlationId.isBlank()) {
            throw new IllegalArgumentException("correlationId는 필수입니다.");
        }
        return auditEventRepository.findByCorrelationId(correlationId);
    }

    public List<AuditEvent> getEventsByAction(String action) {
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("action은 필수입니다.");
        }
        return auditEventRepository.findByAction(action);
    }

    public List<AuditEvent> getEventsByTarget(String targetType, String targetId) {
        if (targetType == null || targetType.isBlank() || targetId == null || targetId.isBlank()) {
            throw new IllegalArgumentException("targetType과 targetId는 필수입니다.");
        }
        return auditEventRepository.findByTargetTypeAndTargetId(targetType, targetId);
    }
}
