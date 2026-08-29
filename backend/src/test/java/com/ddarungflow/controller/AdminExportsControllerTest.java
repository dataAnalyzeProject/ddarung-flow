package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.export.ExportFormat;
import com.ddarungflow.export.ExportRequest;
import com.ddarungflow.export.ExportRequestRepository;
import com.ddarungflow.export.ExportSource;
import com.ddarungflow.export.ExportStatus;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "export.storage-root=build/test-exports")
class AdminExportsControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;
    @Autowired private ExportRequestRepository exportRequestRepository;

    @BeforeEach void clearData() { exportRequestRepository.deleteAll(); usersRepository.deleteAll(); }

    @Test void adminCreatesListsAndDownloadsOnlySafeExportFields() throws Exception {
        UsernamePasswordAuthenticationToken firstAdmin = auth("first");
        UsernamePasswordAuthenticationToken secondAdmin = auth("second");
        String response = mockMvc.perform(post("/api/v1/admin/exports").with(authentication(firstAdmin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"source\":\"CURATED\",\"format\":\"CSV\",\"purpose\":\"운영 검토\",\"rowCount\":10}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.exportId").exists()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.requesterUserId").doesNotExist()).andReturn().getResponse().getContentAsString();
        Long exportId = Long.valueOf(response.replaceAll(".*\\\"exportId\\\":(\\d+).*", "$1"));

        mockMvc.perform(get("/api/v1/admin/exports").with(authentication(secondAdmin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].exportId").value(exportId));
        mockMvc.perform(get("/api/v1/admin/exports/{id}/download", exportId).with(authentication(secondAdmin)))
                .andExpect(status().isOk()).andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")));
    }

    @Test void validatesCapAndRechecksExpiry() throws Exception {
        UsernamePasswordAuthenticationToken admin = auth("admin");
        mockMvc.perform(post("/api/v1/admin/exports").with(authentication(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source\":\"CURATED\",\"format\":\"CSV\",\"purpose\":\"운영 검토\",\"rowCount\":100001}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        ExportRequest expired = exportRequestRepository.save(ExportRequest.builder().requesterUserId(1L).source(ExportSource.CURATED).format(ExportFormat.CSV)
                .status(ExportStatus.COMPLETED).requestedAt(OffsetDateTime.now().minusDays(2)).completedAt(OffsetDateTime.now().minusDays(2)).expiresAt(OffsetDateTime.now().minusHours(1)).build());
        mockMvc.perform(get("/api/v1/admin/exports/{id}/download", expired.getId()).with(authentication(admin)))
                .andExpect(status().isGone()).andExpect(jsonPath("$.code").value("EXPORT_EXPIRED"));
    }

    private UsernamePasswordAuthenticationToken auth(String suffix) {
        Users user = usersRepository.save(Users.builder().provider("google").providerUserId("export-admin-" + suffix).displayName("관리자").email(null).role(UserRole.ADMIN).build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
