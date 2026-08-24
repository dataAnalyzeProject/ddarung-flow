package com.ddarungflow.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {

    List<AuditEvent> findByCorrelationId(String correlationId);

    List<AuditEvent> findByAction(String action);

    List<AuditEvent> findByTargetTypeAndTargetId(String targetType, String targetId);

    boolean existsByCorrelationIdAndActionAndTargetTypeAndTargetId(String correlationId, String action, String targetType, String targetId);
}
