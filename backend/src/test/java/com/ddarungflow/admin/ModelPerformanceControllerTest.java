package com.ddarungflow.admin;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.ModelPerformanceRun;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.ModelPerformanceRunRepository;
import com.ddarungflow.repository.UsersRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.time.OffsetDateTime;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") class ModelPerformanceControllerTest {
 @Autowired MockMvc mvc; @Autowired UsersRepository users; @Autowired ModelPerformanceRunRepository runs; @Autowired ObjectMapper mapper;
 @BeforeEach void clear() { runs.deleteAll(); users.deleteAll(); }
 @Test void adminGetsLatestSnapshotAndMissingSnapshotIs404() throws Exception {
  mvc.perform(get("/api/v1/admin/model-performance")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
  Users user=users.save(Users.builder().provider("google").providerUserId("performance-user").displayName("user").role(UserRole.USER).build()); PrincipalDetails userPrincipal=com.ddarungflow.support.AdminSecurityTestSupport.principal(user); mvc.perform(get("/api/v1/admin/model-performance").with(authentication(new UsernamePasswordAuthenticationToken(userPrincipal,null,userPrincipal.getAuthorities())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
  Users admin=users.save(Users.builder().provider("google").providerUserId("performance-admin").displayName("admin").role(UserRole.ADMIN).build()); PrincipalDetails principal=com.ddarungflow.support.AdminSecurityTestSupport.principal(admin); var auth=new UsernamePasswordAuthenticationToken(principal,null,principal.getAuthorities());
  mvc.perform(get("/api/v1/admin/model-performance").with(authentication(auth))).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MODEL_PERFORMANCE_NOT_FOUND"));
  var payload=mapper.createObjectNode(); payload.putObject("evaluation").put("method","FIXED_WINDOW_REPLAY"); payload.putArray("combinations"); payload.putArray("segments"); payload.putArray("calibrationBins");
  runs.save(new ModelPerformanceRun("ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741","data-3.3-inventory-distribution-2026-08-18",OffsetDateTime.parse("2026-08-26T11:40:00Z"),payload));
  mvc.perform(get("/api/v1/admin/model-performance").with(authentication(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.artifactSha256").value("ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741"));
 }
}
