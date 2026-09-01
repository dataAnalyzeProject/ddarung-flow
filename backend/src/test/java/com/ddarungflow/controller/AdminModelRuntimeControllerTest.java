package com.ddarungflow.controller;

import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.repository.UsersRepository;
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
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminModelRuntimeControllerTest {
    private static final String BASE = "/api/v1/admin/model-runtime";
    private static final String SHA = "ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741";

    @Autowired MockMvc mvc;
    @Autowired UsersRepository users;
    @MockitoBean InferenceClient inferenceClient;

    @BeforeEach void clear() {
        reset(inferenceClient);
        users.deleteAll();
    }

    @Test void requiresExistingMetricsPermissionWithStandardAdminErrors() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get(BASE).with(authentication(auth(UserRole.USER, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get(BASE).with(authentication(auth(UserRole.ADMIN, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
    }

    @Test void returnsOnlyValidatedSafeRuntimeIdentity() throws Exception {
        when(inferenceClient.runtimeModel()).thenReturn(runtime());

        mvc.perform(get(BASE).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_METRICS_READ)))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NORMAL"))
            .andExpect(jsonPath("$.modelVersion").value("data-3.1-runtime-pointer"))
            .andExpect(jsonPath("$.artifactSha256").value(SHA))
            .andExpect(jsonPath("$.modelSource").value("verified_active_pointer"))
            .andExpect(jsonPath("$.supportedHorizons[3]").value(240))
            .andExpect(jsonPath("$.supportedQuantities[4]").value(5))
            .andExpect(jsonPath("$.objectKey").doesNotExist())
            .andExpect(jsonPath("$.pointerKey").doesNotExist())
            .andExpect(jsonPath("$.bucket").doesNotExist());
    }

    @Test void mapsUnavailableInferenceToControlledError() throws Exception {
        when(inferenceClient.runtimeModel()).thenThrow(new IllegalStateException("private inference unavailable"));

        mvc.perform(get(BASE).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.MODEL_METRICS_READ)))))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("MODEL_RUNTIME_UNAVAILABLE"))
            .andExpect(jsonPath("$.message").value("실시간 inference 모델 정보를 확인할 수 없습니다."));
    }

    private InferenceDtos.RuntimeModelResponse runtime() {
        return new InferenceDtos.RuntimeModelResponse(
            "NORMAL", "data-3.1-runtime-pointer", SHA, "verified_active_pointer",
            OffsetDateTime.parse("2026-09-01T00:00:00Z"), List.of(60, 120, 180, 240), List.of(1, 2, 3, 4, 5)
        );
    }

    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) {
        Users user = users.save(Users.builder().provider("google").providerUserId(UUID.randomUUID().toString()).displayName("model-runtime").role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
