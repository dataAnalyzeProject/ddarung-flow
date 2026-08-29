package com.ddarungflow.admin.access;

import com.ddarungflow.audit.AuditEventRepository;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminAccessDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminAccessIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;
    @Autowired private AdminUserRoleRepository roleRepository;
    @Autowired private AdminAccessService accessService;
    @Autowired private AdminAuthorityService authorityService;
    @Autowired private AuditEventRepository auditRepository;
    @Autowired private EntityManager entityManager;

    @Test
    void accessBootstrapIsAdditiveAndRoleCatalogRequiresAccessRead() throws Exception {
        Users plainAdmin = saveUser("plain", UserRole.ADMIN);
        UsernamePasswordAuthenticationToken plainAuthentication = tokenFor(plainAdmin);

        mockMvc.perform(get("/api/v1/admin/access").with(authentication(plainAuthentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.accountRole").value("ADMIN"))
                .andExpect(jsonPath("$.adminRoles.length()").value(0))
                .andExpect(jsonPath("$.permissions.length()").value(0))
                .andExpect(jsonPath("$.generatedAt").exists());
        mockMvc.perform(get("/api/v1/admin/roles").with(authentication(plainAuthentication)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));

        Users accessAdmin = saveUser("access", UserRole.ADMIN);
        mockMvc.perform(get("/api/v1/admin/roles").with(authentication(tokenFor(accessAdmin, AdminRole.ACCESS_ADMIN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10))
                .andExpect(jsonPath("$[?(@.roleCode == 'SUPER_ADMIN')].protectedRole").value(true));
    }

    @Test
    void everyRoleHasARepresentativeAllowedEndpointAndMissingPermissionIsStructured403() throws Exception {
        Map<AdminRole, String> allowedEndpoint = Map.of(
                AdminRole.OPS_VIEWER, "/api/v1/admin/overview",
                AdminRole.OPS_OPERATOR, "/api/v1/admin/overview",
                AdminRole.OPS_MANAGER, "/api/v1/admin/overview",
                AdminRole.DATA_ANALYST, "/api/v1/admin/data-quality",
                AdminRole.MODEL_ENGINEER, "/api/v1/admin/models",
                AdminRole.MODEL_APPROVER, "/api/v1/admin/models",
                AdminRole.SUPPORT_OPERATOR, "/api/v1/admin/qna/questions",
                AdminRole.AUDITOR, "/api/v1/admin/audit-logs",
                AdminRole.ACCESS_ADMIN, "/api/v1/admin/roles",
                AdminRole.SUPER_ADMIN, "/api/v1/admin/roles"
        );

        for (AdminRole role : AdminRole.values()) {
            Users user = saveUser("matrix-" + role, UserRole.ADMIN);
            UsernamePasswordAuthenticationToken token = tokenFor(user, role);
            mockMvc.perform(get(allowedEndpoint.get(role)).with(authentication(token)))
                    .andExpect(status().isOk());
            if (role != AdminRole.SUPER_ADMIN) {
                String deniedEndpoint = role == AdminRole.ACCESS_ADMIN
                        ? "/api/v1/admin/overview" : "/api/v1/admin/roles";
                mockMvc.perform(get(deniedEndpoint).with(authentication(token)))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
            }
        }
    }

    @Test
    void desiredSetIsVersionedIdempotentAuditedAndUsesOnlyPublicUserFields() throws Exception {
        Users actor = saveUser("super", UserRole.ADMIN);
        Users target = saveUser("target", UserRole.ADMIN);
        PrincipalDetails principal = principal(actor, AdminRole.SUPER_ADMIN);
        AdminAccessDtos.DesiredSetRequest request = new AdminAccessDtos.DesiredSetRequest(0L,
                List.of(new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_VIEWER, null),
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.AUDITOR, null)), "운영 조회 권한 부여");

        AdminAccessService.RoleUpdateResult first = accessService.replaceRoles(principal, target.getPublicId(), request);
        AdminAccessService.RoleUpdateResult repeated = accessService.replaceRoles(principal, target.getPublicId(), request);

        assertThat(first.isSuccess()).isTrue();
        assertThat(first.response().version()).isEqualTo(1);
        assertThat(repeated.isSuccess()).isTrue();
        assertThat(repeated.response().version()).isEqualTo(1);
        List<AdminUserRole> rows = roleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId());
        assertThat(rows).hasSize(2).allSatisfy(row -> {
            assertThat(row.getAssignmentVersion()).isEqualTo(1);
            assertThat(row.getReason()).isEqualTo("운영 조회 권한 부여");
        });
        assertThat(auditRepository.findByAction("ADMIN_ROLE_ASSIGN")).singleElement().satisfies(event -> {
            assertThat(event.getResult()).isEqualTo(AuditResult.SUCCESS);
            assertThat(event.getTargetId()).isEqualTo(target.getPublicId().toString());
            assertThat(event.getActorRoleCodes()).contains("SUPER_ADMIN");
            assertThat(event.getReason()).isEqualTo("운영 조회 권한 부여");
            assertThat(event.getTargetId()).doesNotContain("@");
        });
        mockMvc.perform(get("/api/v1/admin/audit-logs")
                        .with(authentication(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].targetId").value(target.getPublicId().toString()))
                .andExpect(jsonPath("$.items[0].targetPublicId").value(target.getPublicId().toString()))
                .andExpect(jsonPath("$.items[0].actorRole").value("ADMIN"))
                .andExpect(jsonPath("$.items[0].actorRoleCodes[0]").value("SUPER_ADMIN"))
                .andExpect(jsonPath("$.items[0].actorUserId").doesNotExist())
                .andExpect(jsonPath("$.items[0].reason").doesNotExist())
                .andExpect(jsonPath("$.items[0].email").doesNotExist());

        AdminAccessDtos.DesiredSetRequest stale = new AdminAccessDtos.DesiredSetRequest(0L,
                List.of(new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_OPERATOR, null)), "운영 역할 변경");
        assertThat(accessService.replaceRoles(principal, target.getPublicId(), stale).errorCode())
                .isEqualTo("ROLE_ASSIGNMENT_VERSION_CONFLICT");
        assertThat(auditRepository.findByAction("ADMIN_ROLE_ASSIGN")).anySatisfy(event -> {
            assertThat(event.getResult()).isEqualTo(AuditResult.FAILURE);
            assertThat(event.getReasonCode()).isEqualTo("ROLE_ASSIGNMENT_VERSION_CONFLICT");
        });

        mockMvc.perform(get("/api/v1/admin/users/{id}/roles", target.getPublicId())
                        .with(authentication(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicUserId").value(target.getPublicId().toString()))
                .andExpect(jsonPath("$.displayName").value("target"))
                .andExpect(jsonPath("$.accountRole").value("ADMIN"))
                .andExpect(jsonPath("$.adminRoles[0].roleCode").value("OPS_VIEWER"))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.id").doesNotExist());

        AdminAccessService.RoleUpdateResult revoked = accessService.replaceRoles(principal, target.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(1L, List.of(), "운영 조회 권한 회수"));
        assertThat(revoked.isSuccess()).isTrue();
        assertThat(revoked.response().version()).isEqualTo(2);
        assertThat(roleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId())).isEmpty();
        assertThat(auditRepository.findByAction("ADMIN_ROLE_REVOKE")).anySatisfy(event -> {
            assertThat(event.getResult()).isEqualTo(AuditResult.SUCCESS);
            assertThat(event.getReason()).isEqualTo("운영 조회 권한 회수");
        });
    }

    @Test
    void a1AndA7SingleActiveSuperSelfDeleteUsesLastSuperPrecedenceAndAuditReason() {
        Users actor = saveUser("a1-single-super", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(actor.getId(), AdminRole.SUPER_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "초기 최고 권한", 0));

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(principal(actor, AdminRole.SUPER_ADMIN),
                actor.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "마지막 최고 관리자 회수"));

        assertThat(result.errorCode()).isEqualTo("LAST_SUPER_ADMIN_REQUIRED");
        assertThat(auditRepository.findByAction("ADMIN_ROLE_REVOKE")).singleElement().satisfies(event -> {
            assertThat(event.getResult()).isEqualTo(AuditResult.FAILURE);
            assertThat(event.getReasonCode()).isEqualTo("LAST_SUPER_ADMIN_REQUIRED");
        });
    }

    @Test
    void a2AndA7SingleActiveSuperSelfExpiryReductionUsesLastSuperPrecedenceAndAuditReason() {
        Users actor = saveUser("a2-single-super", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(actor.getId(), AdminRole.SUPER_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "초기 최고 권한", 0));
        OffsetDateTime finiteExpiry = OffsetDateTime.now().plusDays(1);

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(principal(actor, AdminRole.SUPER_ADMIN),
                actor.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L,
                        List.of(new AdminAccessDtos.RoleAssignmentRequest(AdminRole.SUPER_ADMIN, finiteExpiry)),
                        "마지막 최고 관리자 만료"));

        assertThat(result.errorCode()).isEqualTo("LAST_SUPER_ADMIN_REQUIRED");
        assertThat(auditRepository.findByAction("ADMIN_ROLE_REVOKE")).singleElement().satisfies(event -> {
            assertThat(event.getResult()).isEqualTo(AuditResult.FAILURE);
            assertThat(event.getReasonCode()).isEqualTo("LAST_SUPER_ADMIN_REQUIRED");
        });
    }

    @Test
    void a3TwoActiveSupersSelfDeleteUsesSelfProtection() {
        Users actor = saveUser("a3-actor-super", UserRole.ADMIN);
        Users other = saveUser("a3-other-super", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(actor.getId(), AdminRole.SUPER_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "행위자 최고 권한", 0));
        roleRepository.save(new AdminUserRole(other.getId(), AdminRole.SUPER_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "다른 최고 권한", 0));

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(principal(actor, AdminRole.SUPER_ADMIN),
                actor.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "본인 최고 역할 회수"));
        AdminAccessService.RoleUpdateResult shortened = accessService.replaceRoles(principal(actor, AdminRole.SUPER_ADMIN),
                actor.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L,
                        List.of(new AdminAccessDtos.RoleAssignmentRequest(
                                AdminRole.SUPER_ADMIN, OffsetDateTime.now().plusDays(1))),
                        "본인 최고 역할 단축"));

        assertThat(result.errorCode()).isEqualTo("SELF_ROLE_PROTECTED");
        assertThat(shortened.errorCode()).isEqualTo("SELF_ROLE_PROTECTED");
    }

    @Test
    void a4SelfAccessAdminDeleteUsesSelfProtection() {
        Users actor = saveUser("a4-access-admin", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(actor.getId(), AdminRole.ACCESS_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "접근 관리 권한", 0));

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(principal(actor, AdminRole.ACCESS_ADMIN),
                actor.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "본인 접근 역할 회수"));
        AdminAccessService.RoleUpdateResult shortened = accessService.replaceRoles(principal(actor, AdminRole.ACCESS_ADMIN),
                actor.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L,
                        List.of(new AdminAccessDtos.RoleAssignmentRequest(
                                AdminRole.ACCESS_ADMIN, OffsetDateTime.now().plusDays(1))),
                        "본인 접근 역할 단축"));

        assertThat(result.errorCode()).isEqualTo("SELF_ROLE_PROTECTED");
        assertThat(shortened.errorCode()).isEqualTo("SELF_ROLE_PROTECTED");
    }

    @Test
    void a5NonSuperCannotRevokeSuperEvenWhenTargetIsTheLastSuper() {
        Users actor = saveUser("a5-access-admin", UserRole.ADMIN);
        Users target = saveUser("a5-super-target", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(actor.getId(), AdminRole.ACCESS_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "접근 관리 권한", 0));
        roleRepository.save(new AdminUserRole(target.getId(), AdminRole.SUPER_ADMIN, target.getId(),
                OffsetDateTime.now(), null, "회수 대상 최고 권한", 0));

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(principal(actor, AdminRole.ACCESS_ADMIN),
                target.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "최고 관리자 회수 시도"));

        assertThat(result.errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");
    }

    @Test
    void a6ActiveSuperCanRevokeTheOtherSuperWhenOneActiveSuperRemains() {
        Users actor = saveUser("a6-actor-super", UserRole.ADMIN);
        Users target = saveUser("a6-other-super", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(actor.getId(), AdminRole.SUPER_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "행위자 최고 권한", 0));
        roleRepository.save(new AdminUserRole(target.getId(), AdminRole.SUPER_ADMIN, actor.getId(),
                OffsetDateTime.now(), null, "회수 대상 최고 권한", 0));

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(principal(actor, AdminRole.SUPER_ADMIN),
                target.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "다른 최고 관리자 회수"));

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.response().version()).isEqualTo(1);
        assertThat(roleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId())).isEmpty();
        assertThat(roleRepository.findActiveByUserId(actor.getId(), OffsetDateTime.now()))
                .extracting(AdminUserRole::getRoleCode).containsExactly(AdminRole.SUPER_ADMIN);
    }

    @Test
    void superAdminChangesRequireSuperAdminAndExpiredRolesDoNotCreateAuthorities() {
        Users accessActor = saveUser("access-actor", UserRole.ADMIN);
        Users target = saveUser("grant-target", UserRole.ADMIN);
        AdminAccessService.RoleUpdateResult denied = accessService.replaceRoles(principal(accessActor, AdminRole.ACCESS_ADMIN),
                target.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L,
                        List.of(new AdminAccessDtos.RoleAssignmentRequest(AdminRole.SUPER_ADMIN, null)), "최고 관리자 부여"));
        assertThat(denied.errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");

        Users otherSuper = saveUser("other-super", UserRole.ADMIN);
        Users revokeTarget = saveUser("revoke-super", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(otherSuper.getId(), AdminRole.SUPER_ADMIN, otherSuper.getId(),
                OffsetDateTime.now(), null, "다른 최고 관리자", 0));
        roleRepository.save(new AdminUserRole(revokeTarget.getId(), AdminRole.SUPER_ADMIN, otherSuper.getId(),
                OffsetDateTime.now(), null, "회수 대상 최고 관리자", 0));
        AdminAccessService.RoleUpdateResult revokeDenied = accessService.replaceRoles(principal(accessActor, AdminRole.ACCESS_ADMIN),
                revokeTarget.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "최고 관리자 회수"));
        assertThat(revokeDenied.errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");

        Users expired = saveUser("expired", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(expired.getId(), AdminRole.MODEL_APPROVER, accessActor.getId(),
                OffsetDateTime.now().minusDays(2), OffsetDateTime.now().minusDays(1), "만료 역할", 0));
        AdminAuthoritySnapshot snapshot = authorityService.load(expired);
        assertThat(snapshot.roles()).isEmpty();
        assertThat(snapshot.permissions()).isEmpty();
        assertThat(snapshot.defaultConsole()).isNull();
    }

    @Test
    void canonicalPutRejectsMissingPermissionAndDoesNotExposeAlias() throws Exception {
        Users actor = saveUser("no-permission", UserRole.ADMIN);
        Users target = saveUser("put-target", UserRole.ADMIN);
        mockMvc.perform(put("/api/v1/admin/users/{id}/roles", target.getPublicId())
                        .with(csrf()).with(authentication(tokenFor(actor)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedVersion":0,"assignments":[{"roleCode":"OPS_VIEWER","expiresAt":null}],"reason":"운영 조회 부여"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        mockMvc.perform(get("/api/v1/admin/users/{id}/admin-roles", target.getPublicId())
                        .with(authentication(tokenFor(actor, AdminRole.SUPER_ADMIN))))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsTrimmedShortReasonAndRequiresAllAssignmentsRemovedBeforeAdminDemotion() throws Exception {
        Users actor = saveUser("legacy-actor", UserRole.ADMIN);
        Users target = saveUser("legacy-target", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(target.getId(), AdminRole.OPS_VIEWER, actor.getId(),
                OffsetDateTime.now(), null, "기존 역할", 0));
        PrincipalDetails principal = principal(actor, AdminRole.SUPER_ADMIN);

        assertThat(accessService.replaceRoles(principal, target.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(), " x ")).errorCode()).isEqualTo("VALIDATION_ERROR");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                                "/api/v1/admin/users/{id}/role", target.getPublicId())
                        .with(csrf()).with(authentication(new UsernamePasswordAuthenticationToken(
                                principal, null, principal.getAuthorities())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"USER\",\"reason\":\"계정 유형 하향\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        assertThat(usersRepository.findById(target.getId()).orElseThrow().getRole()).isEqualTo(UserRole.ADMIN);
    }

    @Test
    void refreshesExpiredAuthoritiesForTheNextAdminSessionRequestWithoutChangingCsrfMeaning() throws Exception {
        Users admin = saveUser("session-expiry", UserRole.ADMIN);
        OffsetDateTime now = OffsetDateTime.now();
        roleRepository.saveAndFlush(new AdminUserRole(admin.getId(), AdminRole.ACCESS_ADMIN, admin.getId(),
                now.minusHours(1), now.plusHours(1), "세션 만료 검증", 0));
        AdminAuthoritySnapshot initial = authorityService.load(admin);
        PrincipalDetails sessionPrincipal = new PrincipalDetails(admin, Map.of("sub", "session-expiry"), "sub",
                initial.roles(), initial.permissions());
        OAuth2AuthenticationToken sessionAuthentication = new OAuth2AuthenticationToken(sessionPrincipal,
                sessionPrincipal.getAuthorities(), "google");
        SecurityContext securityContext = SecurityContextHolder.createEmptyContext();
        securityContext.setAuthentication(sessionAuthentication);
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, securityContext);

        mockMvc.perform(get("/api/v1/admin/roles").session(session))
                .andExpect(status().isOk());

        roleRepository.deleteAllByUserId(admin.getId());
        roleRepository.flush();
        roleRepository.saveAndFlush(new AdminUserRole(admin.getId(), AdminRole.ACCESS_ADMIN, admin.getId(),
                now.minusHours(2), now.minusHours(1), "만료된 세션 역할", 0));
        assertThat(authorityService.load(admin).permissions()).isEmpty();

        mockMvc.perform(put("/api/v1/admin/users/{id}/roles", admin.getPublicId()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":0,\"assignments\":[],\"reason\":\"만료 후 회수\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mockMvc.perform(get("/api/v1/admin/roles").session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
    }

    @Test
    void refreshesCurrentAccountRoleFromDatabaseForTheSameOauthSession() throws Exception {
        Users detachedSessionUser = saveUser("session-account-role", UserRole.ADMIN);
        entityManager.flush();
        entityManager.detach(detachedSessionUser);
        PrincipalDetails staleAdminPrincipal = new PrincipalDetails(detachedSessionUser,
                Map.of("sub", "session-account-role"), "sub", Set.of(), Set.of());
        OAuth2AuthenticationToken sessionAuthentication = new OAuth2AuthenticationToken(staleAdminPrincipal,
                staleAdminPrincipal.getAuthorities(), "google");
        SecurityContext securityContext = SecurityContextHolder.createEmptyContext();
        securityContext.setAuthentication(sessionAuthentication);
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, securityContext);

        Users currentUser = usersRepository.findById(detachedSessionUser.getId()).orElseThrow();
        currentUser.changeRole(UserRole.USER);
        entityManager.flush();
        mockMvc.perform(get("/api/v1/admin/access").session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));

        currentUser.changeRole(UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(currentUser.getId(), AdminRole.ACCESS_ADMIN, currentUser.getId(),
                OffsetDateTime.now(), null, "현재 계정 역할 갱신", 0));
        entityManager.flush();
        mockMvc.perform(get("/api/v1/admin/access").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountRole").value("ADMIN"))
                .andExpect(jsonPath("$.adminRoles[0]").value("ACCESS_ADMIN"));
    }

    @Test
    void auditsEarlyDesiredSetRejectionsWithPublicTargetAndSanitizedReason() {
        Users actor = saveUser("early-audit-actor", UserRole.ADMIN);
        PrincipalDetails principal = principal(actor, AdminRole.SUPER_ADMIN);
        UUID missingPublicId = UUID.randomUUID();

        assertThat(accessService.replaceRoles(principal, missingPublicId,
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "  없는\t사용자\n회수  ")).errorCode())
                .isEqualTo("ADMIN_USER_NOT_FOUND");

        Users adminTarget = saveUser("early-audit-admin", UserRole.ADMIN);
        assertThat(accessService.replaceRoles(principal, adminTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_VIEWER, null),
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_VIEWER, null)),
                        "  중복\t역할\n검토  ")).errorCode()).isEqualTo("VALIDATION_ERROR");
        assertThat(accessService.replaceRoles(principal, adminTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_VIEWER, OffsetDateTime.now().minusMinutes(1))),
                        "만료 역할 검토")).errorCode()).isEqualTo("VALIDATION_ERROR");

        Users userTarget = saveUser("early-audit-user", UserRole.USER);
        assertThat(accessService.replaceRoles(principal, userTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_VIEWER, null)),
                        "일반 사용자 부여")).errorCode()).isEqualTo("VALIDATION_ERROR");
        assertThat(accessService.replaceRoles(principal, adminTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(), " x ")).errorCode())
                .isEqualTo("VALIDATION_ERROR");

        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", missingPublicId.toString())).anySatisfy(event -> {
            assertThat(event.getTargetId()).isEqualTo(missingPublicId.toString());
            assertThat(event.getReasonCode()).isEqualTo("ADMIN_USER_NOT_FOUND");
            assertThat(event.getReason()).isEqualTo("없는 사용자 회수");
        });
        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", adminTarget.getPublicId().toString())).anySatisfy(event -> {
            assertThat(event.getTargetId()).isEqualTo(adminTarget.getPublicId().toString());
            assertThat(event.getReasonCode()).isEqualTo("VALIDATION_ERROR");
            assertThat(event.getReason()).isEqualTo("중복 역할 검토");
        }).anySatisfy(event -> {
            assertThat(event.getTargetId()).isEqualTo(adminTarget.getPublicId().toString());
            assertThat(event.getReasonCode()).isEqualTo("VALIDATION_ERROR");
            assertThat(event.getReason()).isNull();
        });
        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", userTarget.getPublicId().toString())).anySatisfy(event -> {
            assertThat(event.getTargetId()).isEqualTo(userTarget.getPublicId().toString());
            assertThat(event.getReasonCode()).isEqualTo("VALIDATION_ERROR");
            assertThat(event.getReason()).isEqualTo("일반 사용자 부여");
        });
    }

    @Test
    void highRiskGrantRequiresTheSameActiveRoleButExcludesModelEngineerAndAllowsSuperAdmin() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        Users accessActor = saveUser("high-risk-access", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(accessActor.getId(), AdminRole.ACCESS_ADMIN, accessActor.getId(),
                now.minusMinutes(1), null, "접근 역할 관리자", 0));
        roleRepository.flush();
        PrincipalDetails accessPrincipal = principal(accessActor, AdminRole.ACCESS_ADMIN);

        Users modelEngineerTarget = saveUser("model-engineer-target", UserRole.ADMIN);
        assertThat(accessService.replaceRoles(accessPrincipal, modelEngineerTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_ENGINEER, null)),
                        "모델 엔지니어 부여")).isSuccess()).isTrue();

        Users deniedTarget = saveUser("high-risk-denied", UserRole.ADMIN);
        mockMvc.perform(put("/api/v1/admin/users/{id}/roles", deniedTarget.getPublicId())
                        .with(csrf()).with(authentication(new UsernamePasswordAuthenticationToken(
                                accessPrincipal, null, accessPrincipal.getAuthorities())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":0,\"assignments\":[{\"roleCode\":\"OPS_MANAGER\",\"expiresAt\":null}],\"reason\":\"고위험 역할 부여\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", deniedTarget.getPublicId().toString()))
                .anySatisfy(event -> {
                    assertThat(event.getAction()).isEqualTo("ADMIN_ROLE_ASSIGN");
                    assertThat(event.getResult()).isEqualTo(AuditResult.FAILURE);
                    assertThat(event.getReasonCode()).isEqualTo("HIGH_RISK_ROLE_NOT_HELD");
                    assertThat(event.getReason()).isEqualTo("고위험 역할 부여");
                });

        Users sameRoleActor = saveUser("same-high-risk", UserRole.ADMIN);
        roleRepository.saveAll(List.of(
                new AdminUserRole(sameRoleActor.getId(), AdminRole.ACCESS_ADMIN, sameRoleActor.getId(),
                        now.minusMinutes(1), null, "접근 역할 관리자", 0),
                new AdminUserRole(sameRoleActor.getId(), AdminRole.OPS_MANAGER, sameRoleActor.getId(),
                        now.minusMinutes(1), now.plusHours(1), "보유 운영 관리자", 0)));
        roleRepository.flush();
        Users sameRoleTarget = saveUser("same-role-target", UserRole.ADMIN);
        assertThat(accessService.replaceRoles(principal(sameRoleActor, AdminRole.ACCESS_ADMIN, AdminRole.OPS_MANAGER),
                sameRoleTarget.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_MANAGER, null)),
                        "동일 고위험 역할 부여")).isSuccess()).isTrue();

        Users expiredHolder = saveUser("expired-high-risk-holder", UserRole.ADMIN);
        roleRepository.saveAll(List.of(
                new AdminUserRole(expiredHolder.getId(), AdminRole.ACCESS_ADMIN, expiredHolder.getId(),
                        now.minusHours(2), null, "접근 역할 관리자", 0),
                new AdminUserRole(expiredHolder.getId(), AdminRole.OPS_MANAGER, expiredHolder.getId(),
                        now.minusHours(2), now.minusHours(1), "만료 운영 관리자", 0)));
        roleRepository.flush();
        Users expiredHolderTarget = saveUser("expired-holder-target", UserRole.ADMIN);
        assertThat(accessService.replaceRoles(principal(expiredHolder, AdminRole.ACCESS_ADMIN, AdminRole.OPS_MANAGER),
                expiredHolderTarget.getPublicId(), new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_MANAGER, null)),
                        "만료 보유 역할 부여")).errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");

        Users superActor = saveUser("high-risk-super", UserRole.ADMIN);
        roleRepository.saveAndFlush(new AdminUserRole(superActor.getId(), AdminRole.SUPER_ADMIN, superActor.getId(),
                now.minusMinutes(1), null, "최고 관리자", 0));
        Users superTarget = saveUser("super-bypass-target", UserRole.ADMIN);
        assertThat(accessService.replaceRoles(principal(superActor, AdminRole.SUPER_ADMIN), superTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_APPROVER, null)),
                        "최고 관리자 우회")).isSuccess()).isTrue();
    }

    @Test
    void highRiskEscalationIncludesReactivationExtensionAndPermanentButNotIdenticalShorteningOrRevoke() {
        OffsetDateTime now = OffsetDateTime.now();
        Users actor = saveUser("high-risk-escalation", UserRole.ADMIN);
        roleRepository.saveAndFlush(new AdminUserRole(actor.getId(), AdminRole.ACCESS_ADMIN, actor.getId(),
                now.minusMinutes(1), null, "접근 역할 관리자", 0));
        PrincipalDetails principal = principal(actor, AdminRole.ACCESS_ADMIN);

        Users identicalTarget = saveUser("high-risk-identical", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(identicalTarget.getId(), AdminRole.MODEL_APPROVER, actor.getId(),
                now.minusMinutes(1), null, "기존 모델 승인자", 0));
        assertThat(accessService.replaceRoles(principal, identicalTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_APPROVER, null)),
                        "동일 상태 유지")).isSuccess()).isTrue();

        Users expiredTarget = saveUser("high-risk-reactivate", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(expiredTarget.getId(), AdminRole.OPS_MANAGER, actor.getId(),
                now.minusHours(2), now.minusHours(1), "만료 운영 관리자", 0));
        assertThat(accessService.replaceRoles(principal, expiredTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_MANAGER, null)),
                        "만료 역할 재활성화")).errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");

        OffsetDateTime finiteExpiry = now.plusHours(1);
        Users extensionTarget = saveUser("high-risk-extension", UserRole.ADMIN);
        roleRepository.save(new AdminUserRole(extensionTarget.getId(), AdminRole.MODEL_APPROVER, actor.getId(),
                now.minusMinutes(1), finiteExpiry, "기간제 모델 승인자", 0));
        assertThat(accessService.replaceRoles(principal, extensionTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_APPROVER, now.plusHours(2))),
                        "만료 시각 연장")).errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");
        assertThat(accessService.replaceRoles(principal, extensionTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_APPROVER, null)),
                        "무기한 역할 전환")).errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");

        assertThat(accessService.replaceRoles(principal, extensionTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_APPROVER, now.plusMinutes(30))),
                        "만료 시각 단축")).isSuccess()).isTrue();
        assertThat(accessService.replaceRoles(principal, extensionTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(1L, List.of(), "고위험 역할 회수")).isSuccess()).isTrue();
    }

    @Test
    void expiryShorteningRequiresRevokePermissionAndWritesRevokeAudit() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        Users actor = saveUser("shortening-actor", UserRole.ADMIN);
        roleRepository.saveAndFlush(new AdminUserRole(actor.getId(), AdminRole.ACCESS_ADMIN, actor.getId(),
                now.minusMinutes(1), null, "접근 역할 관리자", 0));
        Users target = saveUser("shortening-target", UserRole.ADMIN);
        roleRepository.saveAndFlush(new AdminUserRole(target.getId(), AdminRole.MODEL_APPROVER, actor.getId(),
                now.minusMinutes(1), now.plusHours(2), "기존 모델 승인자", 0));

        PrincipalDetails assignOnly = new PrincipalDetails(actor, Set.of(AdminRole.ACCESS_ADMIN),
                Set.of(AdminPermission.ACCESS_ASSIGN));
        mockMvc.perform(put("/api/v1/admin/users/{id}/roles", target.getPublicId())
                        .with(csrf()).with(authentication(new UsernamePasswordAuthenticationToken(
                                assignOnly, null, assignOnly.getAuthorities())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":0,\"assignments\":[{\"roleCode\":\"MODEL_APPROVER\",\"expiresAt\":\""
                                + now.plusHours(1) + "\"}],\"reason\":\"만료 시각 단축\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));

        PrincipalDetails revokeOnly = new PrincipalDetails(actor, Set.of(AdminRole.ACCESS_ADMIN),
                Set.of(AdminPermission.ACCESS_REVOKE));
        assertThat(accessService.replaceRoles(revokeOnly, target.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_APPROVER, now.plusHours(1))),
                        "만료 시각 단축")).isSuccess()).isTrue();
        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", target.getPublicId().toString()))
                .allSatisfy(event -> assertThat(event.getAction()).isEqualTo("ADMIN_ROLE_REVOKE"))
                .anySatisfy(event -> assertThat(event.getResult()).isEqualTo(AuditResult.SUCCESS));
    }

    @Test
    void unrelatedGrantPreservesUnchangedAssignmentProvenance() {
        OffsetDateTime now = OffsetDateTime.now();
        Users actor = saveUser("provenance-actor", UserRole.ADMIN);
        roleRepository.saveAndFlush(new AdminUserRole(actor.getId(), AdminRole.ACCESS_ADMIN, actor.getId(),
                now.minusMinutes(1), null, "접근 역할 관리자", 0));
        Users originalGrantor = saveUser("original-grantor", UserRole.ADMIN);
        Users target = saveUser("provenance-target", UserRole.ADMIN);
        for (int i = 0; i < 7; i++) target.incrementAdminRoleVersion();
        OffsetDateTime originalGrantedAt = now.minusDays(2);
        AdminUserRole unchanged = roleRepository.saveAndFlush(new AdminUserRole(target.getId(), AdminRole.OPS_VIEWER,
                originalGrantor.getId(), originalGrantedAt, null, "원래 조회 역할", 7));
        Long unchangedId = unchanged.getId();

        AdminAccessService.RoleUpdateResult result = accessService.replaceRoles(
                principal(actor, AdminRole.ACCESS_ADMIN), target.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(7L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.OPS_VIEWER, null),
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.MODEL_ENGINEER, null)),
                        "모델 엔지니어 추가"));
        assertThat(result.isSuccess()).isTrue();

        List<AdminUserRole> rows = roleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId());
        AdminUserRole preserved = rows.stream().filter(row -> row.getRoleCode() == AdminRole.OPS_VIEWER).findFirst().orElseThrow();
        AdminUserRole added = rows.stream().filter(row -> row.getRoleCode() == AdminRole.MODEL_ENGINEER).findFirst().orElseThrow();
        assertThat(preserved.getId()).isEqualTo(unchangedId);
        assertThat(preserved.getGrantedBy()).isEqualTo(originalGrantor.getId());
        assertThat(preserved.getGrantedAt()).isEqualTo(originalGrantedAt);
        assertThat(preserved.getReason()).isEqualTo("원래 조회 역할");
        assertThat(preserved.getAssignmentVersion()).isEqualTo(7L);
        assertThat(added.getGrantedBy()).isEqualTo(actor.getId());
        assertThat(added.getReason()).isEqualTo("모델 엔지니어 추가");
        assertThat(added.getAssignmentVersion()).isEqualTo(8L);
        assertThat(target.getAdminRoleVersion()).isEqualTo(8L);
    }

    @Test
    void staleSuperPrincipalCannotGrantOrRevokeAndSuperGrantUsesHighRiskReason() {
        OffsetDateTime now = OffsetDateTime.now();
        Users staleActor = saveUser("stale-super", UserRole.ADMIN);
        PrincipalDetails staleSuper = principal(staleActor, AdminRole.SUPER_ADMIN);

        Users grantTarget = saveUser("stale-super-grant", UserRole.ADMIN);
        assertThat(accessService.replaceRoles(staleSuper, grantTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(
                        new AdminAccessDtos.RoleAssignmentRequest(AdminRole.SUPER_ADMIN, null)),
                        "최고 관리자 신규 부여")).errorCode()).isEqualTo("ADMIN_PERMISSION_DENIED");
        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", grantTarget.getPublicId().toString()))
                .anySatisfy(event -> assertThat(event.getReasonCode()).isEqualTo("HIGH_RISK_ROLE_NOT_HELD"));

        Users revokeTarget = saveUser("stale-super-revoke", UserRole.ADMIN);
        roleRepository.saveAndFlush(new AdminUserRole(revokeTarget.getId(), AdminRole.SUPER_ADMIN, revokeTarget.getId(),
                now.minusMinutes(1), null, "회수 대상 최고 관리자", 0));
        assertThat(accessService.replaceRoles(staleSuper, revokeTarget.getPublicId(),
                new AdminAccessDtos.DesiredSetRequest(0L, List.of(), "최고 관리자 회수")).errorCode())
                .isEqualTo("ADMIN_PERMISSION_DENIED");
        assertThat(auditRepository.findByTargetTypeAndTargetId("ADMIN_ROLE", revokeTarget.getPublicId().toString()))
                .anySatisfy(event -> assertThat(event.getReasonCode()).isEqualTo("ADMIN_PERMISSION_DENIED"));
    }

    private Users saveUser(String id, UserRole role) {
        return usersRepository.save(Users.builder().provider("google").providerUserId(id + UUID.randomUUID())
                .displayName(id).email("hidden@example.com").role(role).build());
    }

    private PrincipalDetails principal(Users user, AdminRole... roles) {
        EnumSet<AdminRole> roleSet = roles.length == 0 ? EnumSet.noneOf(AdminRole.class) : EnumSet.of(roles[0], roles);
        EnumSet<AdminPermission> permissions = EnumSet.noneOf(AdminPermission.class);
        roleSet.forEach(role -> permissions.addAll(role.permissions()));
        return new PrincipalDetails(user, roleSet, permissions);
    }

    private UsernamePasswordAuthenticationToken tokenFor(Users user, AdminRole... roles) {
        PrincipalDetails principal = principal(user, roles);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
