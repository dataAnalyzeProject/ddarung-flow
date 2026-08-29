package com.ddarungflow.admin;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.dto.PrincipalDetails;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") class AdminOverviewControllerTest {
 @Autowired MockMvc mvc; @Autowired UsersRepository users;
 @Test void overviewUsesExistingAdminAuthenticationContract() throws Exception { mvc.perform(get("/api/v1/admin/overview")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED")); Users user=users.save(Users.builder().provider("google").providerUserId("overview-user").displayName("user").role(UserRole.USER).build()); PrincipalDetails principal=com.ddarungflow.support.AdminSecurityTestSupport.principal(user); mvc.perform(get("/api/v1/admin/overview").with(authentication(new UsernamePasswordAuthenticationToken(principal,null,principal.getAuthorities())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED")); Users admin=users.save(Users.builder().provider("google").providerUserId("overview-admin").displayName("admin").role(UserRole.ADMIN).build()); PrincipalDetails adminPrincipal=com.ddarungflow.support.AdminSecurityTestSupport.principal(admin); mvc.perform(get("/api/v1/admin/overview").with(authentication(new UsernamePasswordAuthenticationToken(adminPrincipal,null,adminPrincipal.getAuthorities())))).andExpect(status().isOk()).andExpect(jsonPath("$.activeModel.state").value("NONE")); }
}
