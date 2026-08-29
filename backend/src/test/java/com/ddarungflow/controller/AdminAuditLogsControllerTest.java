package com.ddarungflow.controller;

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
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminAuditLogsControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;

    @Test
    void adminGetsPageResponseAndInvalidInputsReturnValidationError() throws Exception {
        mockMvc.perform(get("/api/v1/admin/audit-logs?action=ROLE_CHANGE&result=SUCCESS&page=0&size=1")
                        .with(authentication(adminAuthentication())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(1));
        mockMvc.perform(get("/api/v1/admin/audit-logs?from=2026-08-27T00:00:00%2B09:00&to=2026-08-26T00:00:00%2B09:00")
                        .with(authentication(adminAuthentication())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private UsernamePasswordAuthenticationToken adminAuthentication() {
        Users user = usersRepository.save(Users.builder().provider("google").providerUserId("audit-admin-" + System.nanoTime())
                .displayName("감사 관리자").email(null).role(UserRole.ADMIN).build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
