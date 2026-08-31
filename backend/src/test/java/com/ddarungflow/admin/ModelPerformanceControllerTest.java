package com.ddarungflow.admin;

import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.ModelPerformanceRun;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.ModelPerformanceRunRepository;
import com.ddarungflow.repository.UsersRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") class ModelPerformanceControllerTest {
    private static final String BASE = "/api/v1/admin/model-performance";
    private static final String DIAGNOSTICS = BASE + "/diagnostics";
    private static final String SHA_A = "ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741";
    private static final String SHA_B = "ed6d11b1e4b7c562396a0d7b3e556c5417f708a2c65cf762351a4bf47ac6f4cf";

    @Autowired MockMvc mvc;
    @Autowired UsersRepository users;
    @MockitoBean ModelPerformanceRunRepository runs;
    @Autowired ObjectMapper mapper;

    @BeforeEach void clear() { reset(runs); users.deleteAll(); }

    @Test void baseExcludesDiagnosticsAndRequiresMetricsPermission() throws Exception {
        latest(run(SHA_A, "model-a", "2026-08-26T11:40:00Z", payload("legacy", 0)));

        mvc.perform(get(BASE)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get(BASE).with(authentication(auth(UserRole.USER, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get(BASE).with(authentication(auth(UserRole.ADMIN, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        mvc.perform(get(BASE).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_METRICS_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.artifactSha256").value(SHA_A))
                .andExpect(jsonPath("$.modelVersion").value("model-a"))
                .andExpect(jsonPath("$.generatedAt").value("2026-08-26T11:40:00Z"))
                .andExpect(jsonPath("$.evaluation.method").value("FIXED_WINDOW_REPLAY"))
                .andExpect(jsonPath("$.combinations[0].sampleCount").value(0))
                .andExpect(jsonPath("$.segments").doesNotExist())
                .andExpect(jsonPath("$.calibrationBins[0].meanPredicted").value(nullValue()));
    }

    @Test void diagnosticsHasSeparatePermissionAndOnlyReturnsDiagnosticsProjection() throws Exception {
        latest(run(SHA_A, "model-a", "2026-08-26T11:40:00Z", payload("diagnostic", 0)));

        mvc.perform(get(DIAGNOSTICS)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get(DIAGNOSTICS).with(authentication(auth(UserRole.USER, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get(DIAGNOSTICS).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_METRICS_READ)))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        mvc.perform(get(DIAGNOSTICS).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_DIAGNOSTICS_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.artifactSha256").value(SHA_A))
                .andExpect(jsonPath("$.modelVersion").value("model-a"))
                .andExpect(jsonPath("$.generatedAt").value("2026-08-26T11:40:00Z"))
                .andExpect(jsonPath("$.segments[0].name").value("diagnostic"))
                .andExpect(jsonPath("$.segments[0].sampleCount").value(0))
                .andExpect(jsonPath("$.segments[0].brier").value(nullValue()))
                .andExpect(jsonPath("$.evaluation").doesNotExist())
                .andExpect(jsonPath("$.combinations").doesNotExist())
                .andExpect(jsonPath("$.calibrationBins").doesNotExist());
        mvc.perform(get(BASE).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_DIAGNOSTICS_READ)))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
    }

    @Test void baseAndDiagnosticsUseTheSameLatestAndArtifactSelectionRules() throws Exception {
        latest(run(SHA_A, "model-a-new", "2026-08-28T11:40:00Z", payload("a-new", 3)));
        when(runs.findFirstByArtifactSha256OrderByGeneratedAtDesc(SHA_B)).thenReturn(Optional.of(run(SHA_B, "model-b", "2026-08-27T11:40:00Z", payload("b-latest", 2))));
        when(runs.findFirstByArtifactSha256OrderByGeneratedAtDesc("0000000000000000000000000000000000000000000000000000000000000000")).thenReturn(Optional.empty());
        var both = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_METRICS_READ, AdminPermission.MODEL_DIAGNOSTICS_READ)));

        mvc.perform(get(BASE).with(both)).andExpect(status().isOk()).andExpect(jsonPath("$.artifactSha256").value(SHA_A)).andExpect(jsonPath("$.modelVersion").value("model-a-new"));
        mvc.perform(get(DIAGNOSTICS).with(both)).andExpect(status().isOk()).andExpect(jsonPath("$.artifactSha256").value(SHA_A)).andExpect(jsonPath("$.modelVersion").value("model-a-new"));
        mvc.perform(get(BASE).param("artifactSha256", SHA_B).with(both)).andExpect(status().isOk()).andExpect(jsonPath("$.modelVersion").value("model-b"));
        mvc.perform(get(DIAGNOSTICS).param("artifactSha256", SHA_B).with(both)).andExpect(status().isOk()).andExpect(jsonPath("$.modelVersion").value("model-b"));
        mvc.perform(get(BASE).param("artifactSha256", "0000000000000000000000000000000000000000000000000000000000000000").with(both))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MODEL_PERFORMANCE_NOT_FOUND"));
        mvc.perform(get(DIAGNOSTICS).param("artifactSha256", "0000000000000000000000000000000000000000000000000000000000000000").with(both))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MODEL_PERFORMANCE_NOT_FOUND"));
    }

    private ModelPerformanceRun run(String sha, String version, String generatedAt, ObjectNode payload) {
        return new ModelPerformanceRun(sha, version, OffsetDateTime.parse(generatedAt), payload);
    }

    private void latest(ModelPerformanceRun run) {
        when(runs.findFirstByOrderByGeneratedAtDesc()).thenReturn(Optional.of(run));
    }

    private ObjectNode payload(String segmentName, int sampleCount) {
        var payload = mapper.createObjectNode();
        payload.putObject("evaluation").put("method", "FIXED_WINDOW_REPLAY");
        payload.putArray("combinations").addObject().put("sampleCount", sampleCount);
        payload.putArray("segments").addObject().put("name", segmentName).put("sampleCount", sampleCount)
                .put("state", "UNKNOWN_INSUFFICIENT_SAMPLES").putNull("brier");
        payload.putArray("calibrationBins").addObject().put("sampleCount", sampleCount).putNull("meanPredicted");
        return payload;
    }

    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) {
        Users user = users.save(Users.builder().provider("google").providerUserId(UUID.randomUUID().toString()).displayName("model-performance").role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
