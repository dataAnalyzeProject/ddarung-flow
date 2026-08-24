package com.ddarungflow.audit;

import org.springframework.data.repository.Repository;

import java.util.List;

@org.springframework.stereotype.Repository
public interface AuditEventRepository extends Repository<AuditEvent, Long> {

    AuditEvent save(AuditEvent entity);

    List<AuditEvent> findByCorrelationId(String correlationId);

    List<AuditEvent> findByAction(String action);

    List<AuditEvent> findByTargetTypeAndTargetId(String targetType, String targetId);

    boolean existsByCorrelationIdAndActionAndTargetTypeAndTargetId(String correlationId, String action, String targetType, String targetId);
}
