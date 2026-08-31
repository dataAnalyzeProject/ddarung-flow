package com.ddarungflow.controller;

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

import java.util.Set;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminSystemAuditLogsControllerSecurityTest {
    @Autowired private org.springframework.test.web.servlet.MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;

    @Test
    void preservesSharedAuthenticationAndPermissionResponses() throws Exception {
        mockMvc.perform(get("/api/v1/admin/system/audit-logs"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mockMvc.perform(get("/api/v1/admin/system/audit-logs").with(authentication(authenticationFor(UserRole.USER))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mockMvc.perform(get("/api/v1/admin/system/audit-logs").with(authentication(authenticationFor(UserRole.ADMIN))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
    }

    private UsernamePasswordAuthenticationToken authenticationFor(UserRole role) {
        Users user = usersRepository.save(Users.builder().provider("google").providerUserId("sys-audit-security-" + role + System.nanoTime())
                .displayName("사용자").email(null).role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user, Set.of(), Set.of());
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
