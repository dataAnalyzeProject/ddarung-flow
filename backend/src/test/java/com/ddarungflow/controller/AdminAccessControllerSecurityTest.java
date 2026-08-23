package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
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
class AdminAccessControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UsersRepository usersRepository;

    @BeforeEach
    void clearUsers() {
        usersRepository.deleteAll();
    }

    @Test
    void anonymousAdminAccessReturnsStructured401() throws Exception {
        mockMvc.perform(get("/api/v1/admin/access"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void userAdminAccessReturnsStructured403() throws Exception {
        mockMvc.perform(get("/api/v1/admin/access").with(authentication(authenticationFor(UserRole.USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    @Test
    void adminCanVerifyAccess() throws Exception {
        mockMvc.perform(get("/api/v1/admin/access").with(authentication(authenticationFor(UserRole.ADMIN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"));
    }

    private UsernamePasswordAuthenticationToken authenticationFor(UserRole role) {
        Users user = usersRepository.save(Users.builder()
                .provider("google")
                .providerUserId("admin-" + role.name())
                .displayName("관리자")
                .email(null)
                .role(role)
                .build());
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
