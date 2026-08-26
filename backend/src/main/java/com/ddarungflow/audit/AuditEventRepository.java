package com.ddarungflow.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

@org.springframework.stereotype.Repository
public interface AuditEventRepository extends Repository<AuditEvent, Long> {

    AuditEvent save(AuditEvent entity);

    List<AuditEvent> findByCorrelationId(String correlationId);

    List<AuditEvent> findByAction(String action);

    List<AuditEvent> findByTargetTypeAndTargetId(String targetType, String targetId);

    @Query("""
            select event from AuditEvent event
            where (:action is null or event.action = :action)
              and (:result is null or event.result = :result)
              and (:reasonCode is null or event.reasonCode = :reasonCode)
              and event.occurredAt >= coalesce(:from, event.occurredAt)
              and event.occurredAt <= coalesce(:to, event.occurredAt)
            """)
    Page<AuditEvent> findAuditLogs(@Param("action") String action,
                                   @Param("result") AuditResult result,
                                   @Param("reasonCode") String reasonCode,
                                   @Param("from") OffsetDateTime from,
                                   @Param("to") OffsetDateTime to,
                                   Pageable pageable);

    boolean existsByCorrelationIdAndActionAndTargetTypeAndTargetId(String correlationId, String action, String targetType, String targetId);
}
