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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminUsersControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;

    @BeforeEach void clearUsers() { usersRepository.deleteAll(); }

    @Test
    void adminListsOnlyPublicUserFieldsAndRejectsInvalidPagination() throws Exception {
        usersRepository.save(user("alpha-user", UserRole.USER));
        usersRepository.save(user("beta-user", UserRole.USER));
        UsernamePasswordAuthenticationToken admin = authFor("admin", UserRole.ADMIN);

        mockMvc.perform(get("/api/v1/admin/users").with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].userId").exists())
                .andExpect(jsonPath("$.items[0].displayName").exists())
                .andExpect(jsonPath("$.items[0].role").exists())
                .andExpect(jsonPath("$.items[0].email").doesNotExist())
                .andExpect(jsonPath("$.items[0].id").doesNotExist());
        mockMvc.perform(get("/api/v1/admin/users?page=0&size=1&sort=displayName,asc&q=alpha").with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].displayName").value("alpha-user"))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.total").value(1));
        mockMvc.perform(get("/api/v1/admin/users?page=-1").with(authentication(admin)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void roleChangeHandlesSelfDemotionNotFoundAndLastAdmin() throws Exception {
        Users target = usersRepository.save(user("target", UserRole.USER));
        UsernamePasswordAuthenticationToken admin = authFor("admin", UserRole.ADMIN);

        mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", target.getPublicId()).with(authentication(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\",\"reason\":\"운영 권한 조정\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        Users actor = ((PrincipalDetails) admin.getPrincipal()).getUsers();
        mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", actor.getPublicId()).with(authentication(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"USER\",\"reason\":\"운영 권한 조정\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("USER"));
        mockMvc.perform(patch("/api/v1/admin/users/00000000-0000-0000-0000-000000000001/role").with(authentication(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"USER\",\"reason\":\"운영 권한 조정\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));

        usersRepository.deleteAll();
        UsernamePasswordAuthenticationToken onlyAdmin = authFor("only-admin", UserRole.ADMIN);
        Users onlyAdminUser = ((PrincipalDetails) onlyAdmin.getPrincipal()).getUsers();
        mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", onlyAdminUser.getPublicId()).with(authentication(onlyAdmin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"USER\",\"reason\":\"운영 권한 조정\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_SUPER_ADMIN_REQUIRED"));
    }

    @Test
    void sameRoleReturnsOkAndRoleChangeOnlyAffectsRequestedUser() throws Exception {
        Users target = usersRepository.save(user("target", UserRole.USER));
        UsernamePasswordAuthenticationToken admin = authFor("admin", UserRole.ADMIN);
        Users actor = ((PrincipalDetails) admin.getPrincipal()).getUsers();

        mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", target.getPublicId()).with(authentication(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"USER\",\"reason\":\"동일 역할 확인\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("USER"));
        mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", target.getPublicId()).with(authentication(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\",\"reason\":\"대상 역할 변경\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.userId").value(target.getPublicId().toString()))
                .andExpect(jsonPath("$.role").value("ADMIN"));

        assertThat(usersRepository.findByPublicId(actor.getPublicId())).get().extracting(Users::getRole).isEqualTo(UserRole.ADMIN);
        assertThat(usersRepository.findByPublicId(target.getPublicId())).get().extracting(Users::getRole).isEqualTo(UserRole.ADMIN);
    }

    private UsernamePasswordAuthenticationToken authFor(String providerUserId, UserRole role) {
        Users saved = usersRepository.save(user(providerUserId, role));
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(saved);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private Users user(String providerUserId, UserRole role) {
        return Users.builder().provider("google").providerUserId(providerUserId).displayName(providerUserId).email(null).role(role).build();
    }
}
