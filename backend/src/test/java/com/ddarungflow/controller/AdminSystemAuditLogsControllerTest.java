package com.ddarungflow.controller;

import com.ddarungflow.audit.AuditEvent;
import com.ddarungflow.audit.AuditEventRepository;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminSystemAuditLogsControllerTest {
    @Autowired private org.springframework.test.web.servlet.MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;
    @Autowired private AuditEventRepository auditEventRepository;

    @Test
    void returnsOnlySafeFieldsWithPaginationAndLeavesLegacyPayloadUntouched() throws Exception {
        OffsetDateTime earlier = OffsetDateTime.parse("2026-08-26T09:00:00+09:00");
        OffsetDateTime later = earlier.plusHours(1);
        saveAudit("ROLE_CHANGE", AuditResult.SUCCESS, "ROLE_CHANGED", earlier);
        saveAudit("ROLE_CHANGE", AuditResult.SUCCESS, "ROLE_CHANGED", later);

        mockMvc.perform(get("/api/v1/admin/system/audit-logs")
                        .param("action", "ROLE_CHANGE").param("result", "SUCCESS").param("reasonCode", "ROLE_CHANGED")
                        .param("from", earlier.minusMinutes(1).toString()).param("to", later.plusMinutes(1).toString())
                        .param("page", "0").param("size", "1").with(authentication(adminAuthentication())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].action").value("ROLE_CHANGE"))
                .andExpect(jsonPath("$.items[0].targetType").value("USER"))
                .andExpect(jsonPath("$.items[0].actorRoleCodes[0]").value("AUDITOR"))
                .andExpect(jsonPath("$.items[0].result").value("SUCCESS"))
                .andExpect(jsonPath("$.items[0].reasonCode").value("ROLE_CHANGED"))
                .andExpect(jsonPath("$.items[0].occurredAt").value("2026-08-26T10:00:00+09:00"))
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].targetId").doesNotExist())
                .andExpect(jsonPath("$.items[0].targetPublicId").doesNotExist())
                .andExpect(jsonPath("$.items[0].correlationId").doesNotExist())
                .andExpect(jsonPath("$.items[0].actorRole").doesNotExist())
                .andExpect(jsonPath("$.items[0].actorUserId").doesNotExist())
                .andExpect(jsonPath("$.items[0].reason").doesNotExist())
                .andExpect(jsonPath("$.items[0].email").doesNotExist())
                .andExpect(jsonPath("$.items[0].providerId").doesNotExist())
                .andExpect(jsonPath("$.items[0].ip").doesNotExist())
                .andExpect(jsonPath("$.items[0].token").doesNotExist());

        mockMvc.perform(get("/api/v1/admin/audit-logs").param("action", "ROLE_CHANGE")
                        .with(authentication(adminAuthentication())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].targetId").value("internal-target"))
                .andExpect(jsonPath("$.items[0].correlationId").value("correlation-id-" + later.toInstant().toEpochMilli()))
                .andExpect(jsonPath("$.items[0].actorRole").value("ADMIN"));
    }

    @Test
    void appliesFiltersAndRejectsInvalidParameters() throws Exception {
        OffsetDateTime start = OffsetDateTime.parse("2026-08-26T09:00:00+09:00");
        saveAudit("ROLE_CHANGE", AuditResult.SUCCESS, "ROLE_CHANGED", start);
        saveAudit("MODEL_REGISTER", AuditResult.FAILURE, "VALIDATION_ERROR", start.plusHours(1));

        mockMvc.perform(get("/api/v1/admin/system/audit-logs").param("result", "FAILURE")
                        .param("reasonCode", "VALIDATION_ERROR").param("from", start.plusMinutes(30).toString())
                        .param("to", start.plusHours(2).toString()).with(authentication(adminAuthentication())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].action").value("MODEL_REGISTER"));
        mockMvc.perform(get("/api/v1/admin/system/audit-logs").param("size", "0").with(authentication(adminAuthentication())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(get("/api/v1/admin/system/audit-logs").param("size", "101").with(authentication(adminAuthentication())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(get("/api/v1/admin/system/audit-logs").param("from", start.plusHours(1).toString())
                        .param("to", start.toString()).with(authentication(adminAuthentication())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(get("/api/v1/admin/system/audit-logs").param("result", "UNKNOWN")
                        .with(authentication(adminAuthentication())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private void saveAudit(String action, AuditResult result, String reasonCode, OffsetDateTime occurredAt) {
        auditEventRepository.save(AuditEvent.builder().actorUserId(99L).actorRole(UserRole.ADMIN)
                .actorRoleCodes("AUDITOR,ACCESS_ADMIN").action(action).targetType("USER").targetId("internal-target")
                .result(result).reasonCode(reasonCode).reason("raw free-text reason")
                .correlationId("correlation-id-" + occurredAt.toInstant().toEpochMilli())
                .occurredAt(occurredAt).build());
    }

    private UsernamePasswordAuthenticationToken adminAuthentication() {
        Users user = usersRepository.save(Users.builder().provider("google").providerUserId("sys-audit-admin-" + System.nanoTime())
                .displayName("감사 관리자").email(null).role(UserRole.ADMIN).build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
