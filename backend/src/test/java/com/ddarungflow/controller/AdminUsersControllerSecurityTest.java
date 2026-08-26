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
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminUsersControllerSecurityTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;
    @BeforeEach void clearUsers() { usersRepository.deleteAll(); }

    @Test void anonymousAndUserAreBlocked() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mockMvc.perform(get("/api/v1/admin/users").with(authentication(authFor(UserRole.USER))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    @Test void roleChangeWithoutCsrfIsBlocked() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/users/00000000-0000-0000-0000-000000000001/role")
                        .with(authentication(authFor(UserRole.ADMIN))).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"USER\",\"reason\":\"운영 권한 조정\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    private UsernamePasswordAuthenticationToken authFor(UserRole role) {
        Users user = usersRepository.save(Users.builder().provider("google").providerUserId("security-" + role).displayName("사용자").email(null).role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
