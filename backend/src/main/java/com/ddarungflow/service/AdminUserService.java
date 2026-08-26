package com.ddarungflow.service;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminUserDtos;
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

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminUserService {
    private static final int MAX_PAGE_SIZE = 100;

    private final UsersRepository usersRepository;
    private final AuditEventService auditEventService;

    public AdminUserDtos.PageResponse listUsers(int page, int size, String sort, String query) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("page와 size 범위가 올바르지 않습니다.");
        }
        Page<Users> users = hasText(query)
                ? usersRepository.findByDisplayNameContainingIgnoreCase(query.trim(), PageRequest.of(page, size, parseSort(sort)))
                : usersRepository.findAll(PageRequest.of(page, size, parseSort(sort)));
        return new AdminUserDtos.PageResponse(users.getContent().stream().map(this::response).toList(), page, size, users.getTotalElements());
    }

    @Transactional
    public RoleChangeResult changeRole(Users actor, UUID targetPublicId, UserRole nextRole) {
        Users target = usersRepository.findByPublicId(targetPublicId).orElse(null);
        if (target == null) {
            audit(actor, targetPublicId.toString(), AuditResult.FAILURE, "USER_NOT_FOUND");
            return RoleChangeResult.error("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
        }
        if (actor.getId().equals(target.getId())) {
            audit(actor, targetPublicId.toString(), AuditResult.FAILURE, "SELF_ROLE_CHANGE_FORBIDDEN");
            return RoleChangeResult.error("SELF_ROLE_CHANGE_FORBIDDEN", "자신의 역할은 변경할 수 없습니다.");
        }
        if (target.getRole() == nextRole) {
            audit(actor, targetPublicId.toString(), AuditResult.SUCCESS, "ROLE_UNCHANGED");
            return RoleChangeResult.success(response(target));
        }
        if (target.getRole() == UserRole.ADMIN && nextRole == UserRole.USER
                && usersRepository.findAllByRoleForUpdate(UserRole.ADMIN.name()).size() <= 1) {
            audit(actor, targetPublicId.toString(), AuditResult.FAILURE, "LAST_SUPER_ADMIN_REQUIRED");
            return RoleChangeResult.error("LAST_SUPER_ADMIN_REQUIRED", "마지막 ADMIN의 역할은 낮출 수 없습니다.");
        }
        target.changeRole(nextRole);
        audit(actor, targetPublicId.toString(), AuditResult.SUCCESS, "ROLE_CHANGED");
        return RoleChangeResult.success(response(target));
    }

    private AdminUserDtos.UserResponse response(Users user) {
        return new AdminUserDtos.UserResponse(user.getPublicId(), user.getDisplayName(), user.getRole());
    }

    private void audit(Users actor, String targetId, AuditResult result, String reasonCode) {
        auditEventService.appendEvent(actor.getId(), actor.getRole(), "ROLE_CHANGE", "USER", targetId, result,
                reasonCode, UUID.randomUUID().toString(), OffsetDateTime.now());
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
