package com.ddarungflow.service;

import com.ddarungflow.admin.access.AdminAccessService;
import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.admin.access.AdminUserRoleRepository;
import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminUserDtos;
import com.ddarungflow.dto.AdminAccessDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminUserService {
    private static final int MAX_PAGE_SIZE = 100;

    private final UsersRepository usersRepository;
    private final AuditEventService auditEventService;
    private final AdminUserRoleRepository adminUserRoleRepository;
    private final AdminAccessService adminAccessService;

    public AdminUserDtos.PageResponse listUsers(int page, int size, String sort, String query) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("page와 size 범위가 올바르지 않습니다.");
        }
        Page<Users> users = hasText(query)
                ? usersRepository.findByDisplayNameContainingIgnoreCase(query.trim(), PageRequest.of(page, size, parseSort(sort)))
                : usersRepository.findAll(PageRequest.of(page, size, parseSort(sort)));
        Map<Long, AdminAccessDtos.UserRolesResponse> access = adminAccessService.getUserRoles(users.getContent());
        return new AdminUserDtos.PageResponse(users.getContent().stream().map(user -> response(user, access.get(user.getId()))).toList(),
                page, size, users.getTotalElements());
    }

    @Transactional
    public RoleChangeResult changeRole(PrincipalDetails principal, UUID targetPublicId, UserRole nextRole, String reason) {
        Users actor = principal.getUsers();
        Users target = usersRepository.findByPublicId(targetPublicId).orElse(null);
        if (target == null) {
            audit(principal, targetPublicId.toString(), AuditResult.FAILURE, "USER_NOT_FOUND", reason);
            return RoleChangeResult.error("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
        }
        if (target.getRole() == nextRole) {
            audit(principal, targetPublicId.toString(), AuditResult.SUCCESS, "ROLE_UNCHANGED", reason);
            return RoleChangeResult.success(response(target, adminAccessService.getUserRoles(targetPublicId)));
        }
        AdminPermission required = nextRole == UserRole.ADMIN ? AdminPermission.ACCESS_ASSIGN : AdminPermission.ACCESS_REVOKE;
        if (!principal.getAdminPermissions().contains(required)) {
            audit(principal, targetPublicId.toString(), AuditResult.FAILURE, "ADMIN_PERMISSION_DENIED", reason);
            return RoleChangeResult.error("ADMIN_PERMISSION_DENIED", "계정 유형 변경 권한이 없습니다.");
        }
        if (target.getRole() == UserRole.ADMIN && nextRole == UserRole.USER
                && !adminUserRoleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId()).isEmpty()) {
            audit(principal, targetPublicId.toString(), AuditResult.FAILURE, "ADMIN_ROLES_MUST_BE_REVOKED", reason);
            return RoleChangeResult.error("VALIDATION_ERROR", "ADMIN 역할을 모두 회수한 뒤 USER로 변경해야 합니다.");
        }
        if (target.getRole() == UserRole.ADMIN && nextRole == UserRole.USER
                && usersRepository.findAllByRoleForUpdate(UserRole.ADMIN.name()).size() <= 1) {
            audit(principal, targetPublicId.toString(), AuditResult.FAILURE, "LAST_SUPER_ADMIN_REQUIRED", reason);
            return RoleChangeResult.error("LAST_SUPER_ADMIN_REQUIRED", "마지막 ADMIN의 역할은 낮출 수 없습니다.");
        }
        audit(principal, targetPublicId.toString(), AuditResult.SUCCESS, "ROLE_CHANGED", reason);
        target.changeRole(nextRole);
        return RoleChangeResult.success(response(target, adminAccessService.getUserRoles(targetPublicId)));
    }

    private AdminUserDtos.UserResponse response(Users user, AdminAccessDtos.UserRolesResponse access) {
        return new AdminUserDtos.UserResponse(user.getPublicId(), user.getDisplayName(), user.getRole(),
                access == null ? List.of() : access.adminRoles(), access != null && access.protectedUser(),
                user.getAdminRoleVersion());
    }

    private void audit(PrincipalDetails principal, String targetId, AuditResult result, String reasonCode, String reason) {
        Users actor = principal.getUsers();
        java.util.Collection<?> roleCodes = principal.getAdminRoles().isEmpty()
                ? List.of(actor.getRole()) : principal.getAdminRoles();
        auditEventService.appendEvent(actor.getId(), actor.getRole(), roleCodes, "ROLE_CHANGE", "USER", targetId, result,
                reasonCode, reason, UUID.randomUUID().toString(), OffsetDateTime.now());
    }

    private Sort parseSort(String value) {
        if (!hasText(value)) return Sort.by("displayName").ascending();
        String[] parts = value.split(",", -1);
        if (parts.length != 2 || !"displayName".equals(parts[0])) {
            throw new IllegalArgumentException("sort는 displayName,asc 또는 displayName,desc여야 합니다.");
        }
        return switch (parts[1]) {
            case "asc" -> Sort.by("displayName").ascending();
            case "desc" -> Sort.by("displayName").descending();
            default -> throw new IllegalArgumentException("sort 방향이 올바르지 않습니다.");
        };
    }

    private boolean hasText(String value) { return value != null && !value.isBlank(); }

    public record RoleChangeResult(AdminUserDtos.UserResponse user, String errorCode, String message) {
        static RoleChangeResult success(AdminUserDtos.UserResponse user) { return new RoleChangeResult(user, null, null); }
        static RoleChangeResult error(String errorCode, String message) { return new RoleChangeResult(null, errorCode, message); }
        public boolean isSuccess() { return errorCode == null; }
    }
}
