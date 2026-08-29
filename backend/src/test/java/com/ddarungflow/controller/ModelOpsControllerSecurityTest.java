package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.admin.access.AdminRole;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.modelops.ModelArtifact;
import com.ddarungflow.modelops.ModelArtifactRepository;
import com.ddarungflow.modelops.ModelArtifactState;
import com.ddarungflow.modelops.ModelEvaluation;
import com.ddarungflow.modelops.ModelEvaluationRepository;
import com.ddarungflow.modelops.ModelRegistryService;
import com.ddarungflow.modelops.ModelUploadRepository;
import com.ddarungflow.repository.UsersRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ModelOpsControllerSecurityTest {

    private static final String HASH = "a".repeat(64);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UsersRepository usersRepository;

    @Autowired
    private ModelArtifactRepository artifactRepository;

    @Autowired
    private ModelEvaluationRepository evaluationRepository;

    @Autowired
    private ModelUploadRepository uploadRepository;

    @Autowired
    private ModelRegistryService modelRegistryService;

    @BeforeEach
    void clearData() {
        evaluationRepository.deleteAll();
        artifactRepository.deleteAll();
        uploadRepository.deleteAll();
        usersRepository.deleteAll();
    }

    @Test
    void anonymousAndUserCannotAccessModelOps() throws Exception {
        UsernamePasswordAuthenticationToken user = authenticationFor(UserRole.USER);

        mockMvc.perform(get("/api/v1/admin/models"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));

        mockMvc.perform(post("/api/v1/admin/models")
                        .with(csrf())
                        .with(authentication(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(modelRequest("user-model")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));

        for (String path : List.of(
                "/api/v1/admin/model-uploads/00000000-0000-0000-0000-000000000001/complete",
                "/api/v1/admin/models/1/validate",
                "/api/v1/admin/models/1/approve",
                "/api/v1/admin/models/1/reject",
                "/api/v1/admin/models/1/activate",
                "/api/v1/admin/models/rollback"
        )) {
            mockMvc.perform(post(path).with(csrf()).with(authentication(user)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        }
        mockMvc.perform(get("/api/v1/admin/models/1/metrics").with(authentication(user)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));

        for (String path : List.of(
                "/api/v1/admin/model-uploads/00000000-0000-0000-0000-000000000001/complete",
                "/api/v1/admin/models/1/validate",
                "/api/v1/admin/models/1/approve",
                "/api/v1/admin/models/1/reject"
        )) {
            mockMvc.perform(post(path).with(csrf()).with(authentication(authenticationFor(UserRole.USER))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        }
        mockMvc.perform(get("/api/v1/admin/models/1/metrics").with(authentication(authenticationFor(UserRole.USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));

        for (String path : List.of(
                "/api/v1/admin/model-uploads/00000000-0000-0000-0000-000000000001/complete",
                "/api/v1/admin/models/1/validate",
                "/api/v1/admin/models/1/approve",
                "/api/v1/admin/models/1/reject"
        )) {
            mockMvc.perform(post(path).with(csrf()).with(authentication(authenticationFor(UserRole.USER))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        }
        mockMvc.perform(get("/api/v1/admin/models/1/metrics").with(authentication(authenticationFor(UserRole.USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    @Test
    void adminCanCreateUploadRegisterTransitionAndReadModels() throws Exception {
        UsernamePasswordAuthenticationToken admin = authenticationFor(UserRole.ADMIN);
        UsernamePasswordAuthenticationToken approver = authenticationFor(UserRole.ADMIN);

        MvcResult uploadResult = mockMvc.perform(post("/api/v1/admin/model-uploads")
                        .with(csrf()).with(authentication(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"objectKey":"models/test.joblib","expectedSha256":"%s","maxBytes":1024,"expiresAt":"2099-01-01T00:00:00+09:00"}
                            """.formatted(HASH)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andReturn();
        String uploadId = objectMapper.readTree(uploadResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/v1/admin/model-uploads/{id}/complete", uploadId)
                        .with(csrf()).with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        mockMvc.perform(post("/api/v1/admin/models")
                        .with(csrf()).with(authentication(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(modelRequest("approved-model")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("DRAFT"));

        ModelArtifact approved = artifactRepository.findAll().getFirst();
        evaluationRepository.saveAll(evaluationsFor(approved.getId()));

        mockMvc.perform(post("/api/v1/admin/models/{id}/validate", approved.getId())
                        .with(csrf()).with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("VALIDATED"));
        mockMvc.perform(post("/api/v1/admin/models/{id}/approve", approved.getId())
                        .with(csrf()).with(authentication(approver)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("APPROVED"));

        mockMvc.perform(get("/api/v1/admin/models").with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].version").value("approved-model"));
        mockMvc.perform(get("/api/v1/admin/models/{id}/metrics", approved.getId()).with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.length()").value(20));

        ModelArtifact rejected = modelRegistryService.registerDraft(new ModelArtifact(
                "rejected-model", admin.getPrincipal() instanceof PrincipalDetails principal ? principal.getUsers().getId() : 0L,
                "models/rejected.joblib", "b".repeat(64), "abc123", "c".repeat(64), "d".repeat(64),
                "v1", ModelArtifactState.DRAFT, OffsetDateTime.now()
        ));
        evaluationRepository.saveAll(evaluationsFor(rejected.getId()));
        mockMvc.perform(post("/api/v1/admin/models/{id}/validate", rejected.getId())
                        .with(csrf()).with(authentication(admin)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/models/{id}/reject", rejected.getId())
                        .with(csrf()).with(authentication(approver)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("REJECTED"));
        assertThrows(IllegalStateException.class, () -> modelRegistryService.transition(rejected.getId(),
                ModelArtifactState.APPROVED, ((PrincipalDetails) approver.getPrincipal()).getUsers().getId()));
    }

    @Test
    void makerCheckerRejectsSameActorAndPermissionlessAdminButAllowsDifferentApprover() throws Exception {
        UsernamePasswordAuthenticationToken maker = authenticationForRoles(AdminRole.MODEL_ENGINEER, AdminRole.MODEL_APPROVER);
        UsernamePasswordAuthenticationToken engineerOnly = authenticationForRoles(AdminRole.MODEL_ENGINEER);
        UsernamePasswordAuthenticationToken checker = authenticationForRoles(AdminRole.MODEL_APPROVER);

        mockMvc.perform(post("/api/v1/admin/models").with(csrf()).with(authentication(maker))
                        .contentType(MediaType.APPLICATION_JSON).content(modelRequest("maker-checker-approve")))
                .andExpect(status().isCreated());
        ModelArtifact approveCandidate = artifactRepository.findAll().getFirst();
        evaluationRepository.saveAll(evaluationsFor(approveCandidate.getId()));
        mockMvc.perform(post("/api/v1/admin/models/{id}/validate", approveCandidate.getId())
                        .with(csrf()).with(authentication(maker))).andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/models/{id}/approve", approveCandidate.getId())
                        .with(csrf()).with(authentication(maker)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MODEL_PROMOTION_GATE_FAILED"));
        mockMvc.perform(post("/api/v1/admin/models/{id}/approve", approveCandidate.getId())
                        .with(csrf()).with(authentication(engineerOnly)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        mockMvc.perform(post("/api/v1/admin/models/{id}/approve", approveCandidate.getId())
                        .with(csrf()).with(authentication(checker)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("APPROVED"));

        mockMvc.perform(post("/api/v1/admin/models").with(csrf()).with(authentication(maker))
                        .contentType(MediaType.APPLICATION_JSON).content(modelRequest("maker-checker-reject", "e".repeat(64))))
                .andExpect(status().isCreated());
        ModelArtifact rejectCandidate = artifactRepository.findAll().stream()
                .filter(model -> "maker-checker-reject".equals(model.getVersion())).findFirst().orElseThrow();
        evaluationRepository.saveAll(evaluationsFor(rejectCandidate.getId()));
        mockMvc.perform(post("/api/v1/admin/models/{id}/validate", rejectCandidate.getId())
                        .with(csrf()).with(authentication(maker))).andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/models/{id}/reject", rejectCandidate.getId())
                        .with(csrf()).with(authentication(maker)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MODEL_PROMOTION_GATE_FAILED"));
        mockMvc.perform(post("/api/v1/admin/models/{id}/reject", rejectCandidate.getId())
                        .with(csrf()).with(authentication(checker)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("REJECTED"));
    }

    private UsernamePasswordAuthenticationToken authenticationFor(UserRole role) {
        Users user = usersRepository.save(Users.builder()
                .provider("google")
                .providerUserId("modelops-" + role.name() + "-" + UUID.randomUUID())
                .displayName("관리자")
                .email(null)
                .role(role)
                .build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private UsernamePasswordAuthenticationToken authenticationForRoles(AdminRole first, AdminRole... rest) {
        Users user = usersRepository.save(Users.builder()
                .provider("google").providerUserId("modelops-role-" + UUID.randomUUID())
                .displayName("관리자").email(null).role(UserRole.ADMIN).build());
        EnumSet<AdminRole> roles = EnumSet.of(first, rest);
        EnumSet<AdminPermission> permissions = EnumSet.noneOf(AdminPermission.class);
        roles.forEach(role -> permissions.addAll(role.permissions()));
        PrincipalDetails principal = new PrincipalDetails(user, roles, permissions);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private String modelRequest(String version) {
        return modelRequest(version, HASH);
    }

    private String modelRequest(String version, String sha256) {
        return """
            {"version":"%s","artifactKey":"models/%s.joblib","sha256":"%s","codeCommit":"abc123","dataManifestHash":"%s","configHash":"%s","featureSchemaVersion":"v1","manifestKey":"models/%s.json","manifestSha256":"%s"}
            """.formatted(version, version, sha256, "b".repeat(64), "c".repeat(64), version, "d".repeat(64));
    }

    private List<ModelEvaluation> evaluationsFor(Long modelId) {
        List<ModelEvaluation> evaluations = new ArrayList<>();
        for (int horizon : List.of(60, 120, 180, 240)) {
            for (int bikes = 1; bikes <= 5; bikes++) {
                evaluations.add(new ModelEvaluation(
                        modelId, horizon, bikes, 10L, BigDecimal.valueOf(0.1), BigDecimal.valueOf(0.2),
                        BigDecimal.valueOf(0.1), BigDecimal.valueOf(0.9), 0
                ));
            }
        }
        return evaluations;
    }
}
