package com.ddarungflow.service;

import com.ddarungflow.audit.AuditEvent;
import com.ddarungflow.audit.AuditEventRepository;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminAuditLogDtos;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAuditLogQueryServiceTest {
    @Mock private AuditEventRepository auditEventRepository;
    @InjectMocks private AdminAuditLogQueryService service;

    @Test
    void combinesFiltersUsesDescendingTimeAndIdAndReturnsOnlyPublicFields() {
        OffsetDateTime occurredAt = OffsetDateTime.parse("2026-08-26T10:00:00+09:00");
        AuditEvent event = AuditEvent.builder().actorUserId(99L).actorRole(UserRole.ADMIN).actorRoleCodes("SUPER_ADMIN").action("ROLE_CHANGE")
                .targetType("USER").targetId("public-user").result(AuditResult.SUCCESS).reasonCode("ROLE_CHANGED")
                .correlationId("correlation-1").occurredAt(occurredAt).build();
        when(auditEventRepository.findAuditLogs(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(event)));

        AdminAuditLogDtos.PageResponse response = service.list(" ROLE_CHANGE ", AuditResult.SUCCESS, " ROLE_CHANGED ",
                occurredAt.minusHours(1), occurredAt.plusHours(1), 1, 10);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().getFirst().action()).isEqualTo("ROLE_CHANGE");
        assertThat(AdminAuditLogDtos.AuditLogResponse.class.getRecordComponents()).extracting(component -> component.getName())
                .doesNotContain("actorUserId", "id", "email", "token", "ipAddress");
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(auditEventRepository).findAuditLogs(eq("ROLE_CHANGE"), eq(AuditResult.SUCCESS), eq("ROLE_CHANGED"), any(), any(), pageable.capture());
        assertThat(pageable.getValue().getSort().toString()).contains("occurredAt: DESC", "id: DESC");
    }

    @Test
    void rejectsInvalidDateAndPageBoundaries() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> service.list(null, null, null, now, now.minusMinutes(1), 0, 20)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.list(null, null, null, null, null, -1, 20)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.list(null, null, null, null, null, 0, 101)).isInstanceOf(IllegalArgumentException.class);
    }
}
