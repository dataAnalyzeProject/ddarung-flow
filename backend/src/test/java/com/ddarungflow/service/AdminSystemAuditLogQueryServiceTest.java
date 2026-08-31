package com.ddarungflow.service;

import com.ddarungflow.audit.AuditEvent;
import com.ddarungflow.audit.AuditEventRepository;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminSystemAuditLogDtos;
import com.ddarungflow.entity.UserRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminSystemAuditLogQueryServiceTest {
    @Mock private AuditEventRepository auditEventRepository;
    @InjectMocks private AdminAuditLogQueryService service;

    @Test
    void projectsOnlyTheSixApprovedFieldsUsingLegacyQuerySemantics() {
        OffsetDateTime occurredAt = OffsetDateTime.parse("2026-08-26T10:00:00+09:00");
        AuditEvent event = AuditEvent.builder().actorUserId(99L).actorRole(UserRole.ADMIN)
                .actorRoleCodes("AUDITOR,ACCESS_ADMIN").action("ROLE_CHANGE").targetType("USER")
                .targetId("internal-target").result(AuditResult.SUCCESS).reasonCode("ROLE_CHANGED")
                .reason("raw reason").correlationId("correlation-1").occurredAt(occurredAt).build();
        when(auditEventRepository.findAuditLogs(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(event)));

        AdminSystemAuditLogDtos.PageResponse response = service.listSystem(" ROLE_CHANGE ", AuditResult.SUCCESS,
                " ROLE_CHANGED ", occurredAt.minusHours(1), occurredAt.plusHours(1), 1, 10);

        assertThat(AdminSystemAuditLogDtos.AuditLogItem.class.getRecordComponents())
                .extracting(component -> component.getName())
                .containsExactly("action", "targetType", "actorRoleCodes", "result", "reasonCode", "occurredAt");
        assertThat(response.items()).singleElement().satisfies(item -> {
            assertThat(item.action()).isEqualTo("ROLE_CHANGE");
            assertThat(item.targetType()).isEqualTo("USER");
            assertThat(item.actorRoleCodes()).containsExactly("AUDITOR", "ACCESS_ADMIN");
        });
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(auditEventRepository).findAuditLogs(eq("ROLE_CHANGE"), eq(AuditResult.SUCCESS), eq("ROLE_CHANGED"),
                any(), any(), pageable.capture());
        assertThat(pageable.getValue().getSort().toString()).contains("occurredAt: DESC", "id: DESC");
    }

    @Test
    void rejectsTheSameInvalidPageAndDateBoundariesAsLegacy() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> service.listSystem(null, null, null, null, null, -1, 20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.listSystem(null, null, null, null, null, 0, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.listSystem(null, null, null, null, null, 0, 101))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.listSystem(null, null, null, now, now.minusMinutes(1), 0, 20))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
