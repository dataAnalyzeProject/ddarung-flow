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
import com.ddarungflow.modelops.ModelArtifactStorageGateway;
import com.ddarungflow.modelops.ModelUpload;
import com.ddarungflow.modelops.ModelUploadStatus;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

    @MockitoBean
    private ModelArtifactStorageGateway storageGateway;

    @BeforeEach
    void clearData() {
        org.mockito.Mockito.reset(storageGateway);
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

        byte[] artifactContent = "approved-model-artifact".getBytes(StandardCharsets.UTF_8);
        String artifactSha = sha256(artifactContent);
        MvcResult uploadResult = mockMvc.perform(post("/api/v1/admin/model-uploads")
                        .with(csrf()).with(authentication(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"fileName":"test.joblib","expectedSha256":"%s","maxBytes":1024,"expiresAt":"2099-01-01T00:00:00+09:00"}
                            """.formatted(artifactSha)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andReturn();
        String uploadId = objectMapper.readTree(uploadResult.getResponse().getContentAsString()).get("id").asText();
        String objectKey = uploadRepository.findById(UUID.fromString(uploadId)).orElseThrow().getObjectKey();
        org.assertj.core.api.Assertions.assertThat(
                objectMapper.readTree(uploadResult.getResponse().getContentAsString()).has("objectKey")).isFalse();
        org.mockito.Mockito.when(storageGateway.inspect(objectKey))
                .thenReturn(new ModelArtifactStorageGateway.Inspection(artifactContent.length, artifactSha));

        mockMvc.perform(put("/api/v1/admin/model-uploads/{id}/content", uploadId)
                        .with(csrf()).with(authentication(admin))
                        .contentType(MediaType.APPLICATION_OCTET_STREAM).content(artifactContent))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UPLOADED"))
                .andExpect(jsonPath("$.observedSha256").value(artifactSha));

        mockMvc.perform(post("/api/v1/admin/model-uploads/{id}/complete", uploadId)
                        .with(csrf()).with(authentication(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        ModelUpload manifestUpload = completedUpload("approved-model-manifest".getBytes(StandardCharsets.UTF_8), "manifest.json");

        mockMvc.perform(post("/api/v1/admin/models")
                        .with(csrf()).with(authentication(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(modelRequest("approved-model", UUID.fromString(uploadId), manifestUpload.getId())))
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

    @Test
    void modelReleaseReaderSeesOnlySafeModelHistoryProjection() throws Exception {
        UsernamePasswordAuthenticationToken engineer = authenticationForRoles(AdminRole.MODEL_ENGINEER);

        mockMvc.perform(post("/api/v1/admin/model-uploads").with(csrf()).with(authentication(engineer))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                            {"fileName":"history.joblib","expectedSha256":"%s","maxBytes":1024,"expiresAt":"2099-01-01T00:00:00+09:00"}
                            """.formatted(HASH)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/admin/models/history").with(authentication(engineer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("MODEL_UPLOAD_CREATE"))
                .andExpect(jsonPath("$[0].resourceType").value("MODEL_UPLOAD"))
                .andExpect(jsonPath("$[0].resourceVersion").isNotEmpty())
                .andExpect(jsonPath("$[0].result").value("SUCCESS"))
                .andExpect(jsonPath("$[0].correlationId").doesNotExist())
                .andExpect(jsonPath("$[0].actorUserId").doesNotExist());

        mockMvc.perform(get("/api/v1/admin/models/history")
                        .with(authentication(authenticationForRoles(AdminRole.DATA_ANALYST))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
    }

    @Test
    void uploadContentAndCompleteRejectDifferentModelEngineer() throws Exception {
        UsernamePasswordAuthenticationToken owner = authenticationForRoles(AdminRole.MODEL_ENGINEER);
        UsernamePasswordAuthenticationToken other = authenticationForRoles(AdminRole.MODEL_ENGINEER);
        MvcResult created = mockMvc.perform(post("/api/v1/admin/model-uploads")
                        .with(csrf()).with(authentication(owner)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"fileName":"private.joblib","expectedSha256":"%s","maxBytes":1024,"expiresAt":"2099-01-01T00:00:00+09:00"}
                            """.formatted(HASH)))
                .andExpect(status().isCreated()).andReturn();
        String uploadId = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(put("/api/v1/admin/model-uploads/{id}/content", uploadId)
                        .with(csrf()).with(authentication(other)).contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .content(new byte[] {1, 2, 3}))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MODEL_UPLOAD_OWNER_MISMATCH"));
        mockMvc.perform(post("/api/v1/admin/model-uploads/{id}/complete", uploadId)
                        .with(csrf()).with(authentication(other)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MODEL_UPLOAD_OWNER_MISMATCH"));
    }

    @Test
    void activationAndRollbackPreGateFailuresAppearInModelHistory() throws Exception {
        UsernamePasswordAuthenticationToken approver = authenticationForRoles(AdminRole.MODEL_APPROVER);

        mockMvc.perform(post("/api/v1/admin/models/{id}/activate", 999L)
                        .with(csrf()).with(authentication(approver)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MODEL_PROMOTION_GATE_FAILED"));
        mockMvc.perform(post("/api/v1/admin/models/rollback")
                        .with(csrf()).with(authentication(approver)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ROLLBACK_TARGET_UNAVAILABLE"));

        mockMvc.perform(get("/api/v1/admin/models/history").with(authentication(approver)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'MODEL_ACTIVATE' && @.reasonCode == 'MODEL_PROMOTION_GATE_FAILED')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.action == 'MODEL_ROLLBACK' && @.reasonCode == 'ROLLBACK_TARGET_UNAVAILABLE')]").isNotEmpty());
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
        ModelUpload artifact = completedUpload(("artifact-" + version + sha256).getBytes(StandardCharsets.UTF_8), version + ".joblib");
        ModelUpload manifest = completedUpload(("manifest-" + version + sha256).getBytes(StandardCharsets.UTF_8), version + ".json");
        return modelRequest(version, artifact.getId(), manifest.getId());
    }

    private String modelRequest(String version, UUID artifactUploadId, UUID manifestUploadId) {
        return """
            {"version":"%s","artifactUploadId":"%s","manifestUploadId":"%s","codeCommit":"abc123","dataManifestHash":"%s","configHash":"%s","featureSchemaVersion":"v1"}
            """.formatted(version, artifactUploadId, manifestUploadId, "b".repeat(64), "c".repeat(64));
    }

    private ModelUpload completedUpload(byte[] content, String fileName) {
        UUID id = UUID.randomUUID();
        String hash = sha256(content);
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(id, usersRepository.findAll().getFirst().getId(),
                "models/uploads/" + id + "/" + fileName, hash, 4096L, ModelUploadStatus.CREATED,
                now.plusHours(1), null, now.minusMinutes(1));
        upload.markUploaded(hash, content.length, now);
        upload.markCompleted(now.plusSeconds(1));
        uploadRepository.save(upload);
        org.mockito.Mockito.when(storageGateway.inspect(upload.getObjectKey()))
                .thenReturn(new ModelArtifactStorageGateway.Inspection(content.length, hash));
        return upload;
    }

    private String sha256(byte[] content) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(content));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
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
