package com.ddarungflow.admin.access;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.dto.AdminAccessDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminAccessService {
    private static final Set<AdminRole> HIGH_RISK_ADMIN_ROLES = Set.of(
            AdminRole.OPS_MANAGER, AdminRole.MODEL_APPROVER,
            AdminRole.ACCESS_ADMIN, AdminRole.SUPER_ADMIN);

    private final UsersRepository usersRepository;
    private final AdminUserRoleRepository adminUserRoleRepository;
    private final AuditEventService auditEventService;

    public List<AdminAccessDtos.RoleCatalogResponse> roleCatalog() {
        return java.util.Arrays.stream(AdminRole.values())
                .map(role -> new AdminAccessDtos.RoleCatalogResponse(role, role.displayName(), role.description(),
                        role.permissions().stream().sorted().toList(), role.systemRole(), role.protectedRole(), role.defaultConsole()))
                .toList();
    }

    public AdminAccessDtos.UserRolesResponse getUserRoles(UUID publicUserId) {
        Users target = usersRepository.findByPublicId(publicUserId).orElse(null);
        return target == null ? null : response(target, adminUserRoleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId()), OffsetDateTime.now());
    }

    public Map<Long, AdminAccessDtos.UserRolesResponse> getUserRoles(List<Users> users) {
        Map<Long, AdminAccessDtos.UserRolesResponse> result = new java.util.HashMap<>();
        OffsetDateTime now = OffsetDateTime.now();
        for (Users user : users) {
            result.put(user.getId(), response(user, adminUserRoleRepository.findAllByUserIdOrderByRoleCodeAsc(user.getId()), now));
        }
        return result;
    }

    @Transactional
    public RoleUpdateResult replaceRoles(PrincipalDetails principal, UUID publicUserId,
                                         AdminAccessDtos.DesiredSetRequest request) {
        Users actor = principal.getUsers();
        String normalizedReason = normalizeReason(request == null ? null : request.reason());
        if (request == null || request.expectedVersion() == null || request.expectedVersion() < 0
                || request.assignments() == null
                || request.assignments().stream().anyMatch(assignment -> assignment == null || assignment.roleCode() == null)
                || normalizedReason == null || normalizedReason.length() < 2 || normalizedReason.length() > 200) {
            auditRejected(principal, publicUserId, request, "VALIDATION_ERROR");
            return RoleUpdateResult.error("VALIDATION_ERROR", "역할 변경 요청이 올바르지 않습니다.");
        }
        Users target = usersRepository.findByPublicIdForUpdate(publicUserId).orElse(null);
        if (target == null) {
            auditRejected(principal, publicUserId, request, "ADMIN_USER_NOT_FOUND");
            return RoleUpdateResult.error("ADMIN_USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
        }

        OffsetDateTime now = OffsetDateTime.now();
        List<AdminUserRole> current = adminUserRoleRepository.findAllByUserIdOrderByRoleCodeAsc(target.getId());
        DesiredAssignments desired = desiredAssignments(request.assignments(), now);
        if (desired.errorCode() != null) {
            auditRejected(principal, publicUserId, request, desired.errorCode());
            return RoleUpdateResult.error(desired.errorCode(), desired.message());
        }
        if (target.getRole() != UserRole.ADMIN && !desired.assignments().isEmpty()) {
            auditRejected(principal, publicUserId, request, "VALIDATION_ERROR");
            return RoleUpdateResult.error("VALIDATION_ERROR", "USER 계정에는 관리자 역할을 부여할 수 없습니다.");
        }

        Set<AdminRole> grantedOrEscalated = grantedOrEscalated(current, desired.assignments(), now);
        Set<AdminRole> reduced = reduced(current, desired.assignments(), now);
        Set<AdminRole> removed = removed(current, desired.assignments());
        EnumSet<AdminRole> revokedOrReduced = EnumSet.noneOf(AdminRole.class);
        revokedOrReduced.addAll(removed);
        revokedOrReduced.addAll(reduced);
        Set<AdminRole> actorActiveRoles = activeRoles(
                adminUserRoleRepository.findActiveByUserId(actor.getId(), now), now);

        if (!grantedOrEscalated.isEmpty() && !principal.getAdminPermissions().contains(AdminPermission.ACCESS_ASSIGN)) {
            auditDenied(actor, target, grantedOrEscalated, "ADMIN_ROLE_ASSIGN", "ADMIN_PERMISSION_DENIED", normalizedReason, principal.getAdminRoles());
            return RoleUpdateResult.error("ADMIN_PERMISSION_DENIED", "역할 부여 권한이 없습니다.");
        }
        if (!revokedOrReduced.isEmpty() && !principal.getAdminPermissions().contains(AdminPermission.ACCESS_REVOKE)) {
            auditDenied(actor, target, revokedOrReduced, "ADMIN_ROLE_REVOKE", "ADMIN_PERMISSION_DENIED", normalizedReason, principal.getAdminRoles());
            return RoleUpdateResult.error("ADMIN_PERMISSION_DENIED", "역할 회수 권한이 없습니다.");
        }

        EnumSet<AdminRole> highRiskGrants = EnumSet.noneOf(AdminRole.class);
        highRiskGrants.addAll(grantedOrEscalated);
        highRiskGrants.retainAll(HIGH_RISK_ADMIN_ROLES);
        if (!highRiskGrants.isEmpty()) {
            if (!actorActiveRoles.contains(AdminRole.SUPER_ADMIN)) {
                EnumSet<AdminRole> rolesNotHeld = EnumSet.copyOf(highRiskGrants);
                rolesNotHeld.removeAll(actorActiveRoles);
                if (!rolesNotHeld.isEmpty()) {
                    auditDenied(actor, target, rolesNotHeld, "ADMIN_ROLE_ASSIGN",
                            "HIGH_RISK_ROLE_NOT_HELD", normalizedReason, principal.getAdminRoles());
                    return RoleUpdateResult.error("ADMIN_PERMISSION_DENIED",
                            "보유하지 않은 고위험 관리자 역할은 부여할 수 없습니다.");
                }
            }
        }

        if (revokedOrReduced.contains(AdminRole.SUPER_ADMIN)
                && !actorActiveRoles.contains(AdminRole.SUPER_ADMIN)) {
            auditDenied(actor, target, Set.of(AdminRole.SUPER_ADMIN), "ADMIN_ROLE_REVOKE",
                    "ADMIN_PERMISSION_DENIED", normalizedReason, principal.getAdminRoles());
            return RoleUpdateResult.error("ADMIN_PERMISSION_DENIED",
                    "SUPER_ADMIN 역할 변경은 SUPER_ADMIN만 수행할 수 있습니다.");
        }

        Set<AdminRole> currentActive = activeRoles(current, now);
        boolean targetSuperDecrease = currentActive.contains(AdminRole.SUPER_ADMIN)
                && revokedOrReduced.contains(AdminRole.SUPER_ADMIN);
        if (targetSuperDecrease
                && adminUserRoleRepository.findActiveSuperAdminsForUpdate(now).size() <= 1) {
            auditDenied(actor, target, Set.of(AdminRole.SUPER_ADMIN), "ADMIN_ROLE_REVOKE",
                    "LAST_SUPER_ADMIN_REQUIRED", normalizedReason, principal.getAdminRoles());
            return RoleUpdateResult.error("LAST_SUPER_ADMIN_REQUIRED", "마지막 SUPER_ADMIN 역할은 회수할 수 없습니다.");
        }

        boolean self = actor.getPublicId().equals(target.getPublicId());
        boolean selfAccessDecrease = currentActive.contains(AdminRole.ACCESS_ADMIN)
                && revokedOrReduced.contains(AdminRole.ACCESS_ADMIN);
        if (self && (targetSuperDecrease || selfAccessDecrease)) {
            Set<AdminRole> protectedRoles = EnumSet.copyOf(currentActive);
            protectedRoles.retainAll(Set.of(AdminRole.SUPER_ADMIN, AdminRole.ACCESS_ADMIN));
            auditDenied(actor, target, protectedRoles, "ADMIN_ROLE_REVOKE", "SELF_ROLE_PROTECTED", normalizedReason, principal.getAdminRoles());
            return RoleUpdateResult.error("SELF_ROLE_PROTECTED", "본인의 보호 역할은 회수할 수 없습니다.");
        }

        if (sameDesiredState(current, desired.assignments())) {
            return RoleUpdateResult.success(response(target, current, now));
        }
        if (target.getAdminRoleVersion() != request.expectedVersion()) {
            auditDenied(actor, target, grantedOrEscalated, "ADMIN_ROLE_ASSIGN",
                    "ROLE_ASSIGNMENT_VERSION_CONFLICT", normalizedReason, principal.getAdminRoles());
            auditDenied(actor, target, revokedOrReduced, "ADMIN_ROLE_REVOKE",
                    "ROLE_ASSIGNMENT_VERSION_CONFLICT", normalizedReason, principal.getAdminRoles());
            return RoleUpdateResult.error("ROLE_ASSIGNMENT_VERSION_CONFLICT", "역할 정보가 다른 요청에 의해 변경되었습니다.");
        }

        long nextVersion = target.incrementAdminRoleVersion();
        EnumMap<AdminRole, AdminUserRole> currentByRole = new EnumMap<>(AdminRole.class);
        current.forEach(assignment -> currentByRole.put(assignment.getRoleCode(), assignment));
        List<AdminUserRole> resulting = current.stream()
                .filter(assignment -> desired.assignments().containsKey(assignment.getRoleCode()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        List<AdminUserRole> removedRows = current.stream()
                .filter(assignment -> removed.contains(assignment.getRoleCode()))
                .toList();
        if (!removedRows.isEmpty()) adminUserRoleRepository.deleteAll(removedRows);

        List<AdminUserRole> changedRows = new ArrayList<>();
        for (AdminRole role : grantedOrEscalated.stream().sorted().toList()) {
            AdminUserRole assignment = currentByRole.get(role);
            if (assignment == null) {
                assignment = new AdminUserRole(target.getId(), role, actor.getId(), now,
                        desired.assignments().get(role), normalizedReason, nextVersion);
                resulting.add(assignment);
            } else {
                assignment.recordGrant(actor.getId(), now, desired.assignments().get(role),
                        normalizedReason, nextVersion);
            }
            changedRows.add(assignment);
        }
        for (AdminRole role : reduced.stream().sorted().toList()) {
            AdminUserRole assignment = currentByRole.get(role);
            assignment.reduceExpiry(desired.assignments().get(role), nextVersion);
            changedRows.add(assignment);
        }
        if (!changedRows.isEmpty()) adminUserRoleRepository.saveAll(changedRows);

        auditSucceeded(actor, target, grantedOrEscalated, "ADMIN_ROLE_ASSIGN", normalizedReason, principal.getAdminRoles());
        auditSucceeded(actor, target, revokedOrReduced, "ADMIN_ROLE_REVOKE", normalizedReason, principal.getAdminRoles());
        return RoleUpdateResult.success(response(target, resulting, now));
    }

    private DesiredAssignments desiredAssignments(List<AdminAccessDtos.RoleAssignmentRequest> assignments, OffsetDateTime now) {
        EnumMap<AdminRole, OffsetDateTime> desired = new EnumMap<>(AdminRole.class);
        for (AdminAccessDtos.RoleAssignmentRequest assignment : assignments) {
            if (desired.containsKey(assignment.roleCode())) {
                return DesiredAssignments.error("VALIDATION_ERROR", "같은 역할을 두 번 지정할 수 없습니다.");
            }
            desired.put(assignment.roleCode(), assignment.expiresAt());
            if (assignment.expiresAt() != null && !assignment.expiresAt().isAfter(now)) {
                return DesiredAssignments.error("VALIDATION_ERROR", "역할 만료 시각은 현재보다 이후여야 합니다.");
            }
        }
        return DesiredAssignments.success(desired);
    }

    private Set<AdminRole> grantedOrEscalated(List<AdminUserRole> current,
                                              Map<AdminRole, OffsetDateTime> desired,
                                              OffsetDateTime now) {
        Map<AdminRole, OffsetDateTime> currentMap = assignmentMap(current);
        EnumSet<AdminRole> grants = EnumSet.noneOf(AdminRole.class);
        desired.forEach((role, desiredExpiry) -> {
            if (!currentMap.containsKey(role)) {
                grants.add(role);
                return;
            }
            OffsetDateTime currentExpiry = currentMap.get(role);
            if (currentExpiry != null && !currentExpiry.isAfter(now)) {
                grants.add(role);
                return;
            }
            if (currentExpiry != null
                    && (desiredExpiry == null || desiredExpiry.isAfter(currentExpiry))) {
                grants.add(role);
            }
        });
        return grants;
    }

    private Set<AdminRole> reduced(List<AdminUserRole> current,
                                   Map<AdminRole, OffsetDateTime> desired,
                                   OffsetDateTime now) {
        Map<AdminRole, OffsetDateTime> currentMap = assignmentMap(current);
        EnumSet<AdminRole> reductions = EnumSet.noneOf(AdminRole.class);
        desired.forEach((role, desiredExpiry) -> {
            if (!currentMap.containsKey(role) || desiredExpiry == null) return;
            OffsetDateTime currentExpiry = currentMap.get(role);
            if (currentExpiry != null && !currentExpiry.isAfter(now)) return;
            if (currentExpiry == null || desiredExpiry.isBefore(currentExpiry)) reductions.add(role);
        });
        return reductions;
    }

    private Set<AdminRole> removed(List<AdminUserRole> current, Map<AdminRole, OffsetDateTime> desired) {
        EnumSet<AdminRole> removed = EnumSet.noneOf(AdminRole.class);
        for (AdminUserRole assignment : current) if (!desired.containsKey(assignment.getRoleCode())) removed.add(assignment.getRoleCode());
        return removed;
    }

    private boolean sameDesiredState(List<AdminUserRole> current, Map<AdminRole, OffsetDateTime> desired) {
        Map<AdminRole, OffsetDateTime> currentMap = assignmentMap(current);
        if (!currentMap.keySet().equals(desired.keySet())) return false;
        return currentMap.entrySet().stream().allMatch(entry -> sameInstant(entry.getValue(), desired.get(entry.getKey())));
    }

    private Map<AdminRole, OffsetDateTime> assignmentMap(List<AdminUserRole> assignments) {
        EnumMap<AdminRole, OffsetDateTime> result = new EnumMap<>(AdminRole.class);
        for (AdminUserRole assignment : assignments) result.put(assignment.getRoleCode(), assignment.getExpiresAt());
        return result;
    }

    private Set<AdminRole> activeRoles(List<AdminUserRole> assignments, OffsetDateTime now) {
        EnumSet<AdminRole> result = EnumSet.noneOf(AdminRole.class);
        for (AdminUserRole assignment : assignments) if (assignment.isActiveAt(now)) result.add(assignment.getRoleCode());
        return result;
    }

    private Set<AdminRole> activeRoles(Map<AdminRole, OffsetDateTime> assignments, OffsetDateTime now) {
        EnumSet<AdminRole> result = EnumSet.noneOf(AdminRole.class);
        assignments.forEach((role, expiry) -> { if (expiry == null || expiry.isAfter(now)) result.add(role); });
        return result;
    }

    private boolean sameInstant(OffsetDateTime left, OffsetDateTime right) {
        return left == null ? right == null : right != null && left.isEqual(right);
    }

    private AdminAccessDtos.UserRolesResponse response(Users user, List<AdminUserRole> assignments, OffsetDateTime now) {
        List<AdminAccessDtos.RoleAssignmentResponse> roles = assignments.stream()
                .sorted(Comparator.comparing(AdminUserRole::getRoleCode))
                .map(assignment -> new AdminAccessDtos.RoleAssignmentResponse(assignment.getRoleCode(), assignment.getExpiresAt()))
                .toList();
        boolean protectedUser = assignments.stream().anyMatch(assignment -> assignment.isActiveAt(now) && assignment.getRoleCode().protectedRole());
        return new AdminAccessDtos.UserRolesResponse(user.getPublicId(), user.getDisplayName(), user.getRole(),
                roles, protectedUser, user.getAdminRoleVersion());
    }

    private void auditSucceeded(Users actor, Users target, Set<AdminRole> roles, String action,
                                String reason, Set<AdminRole> actorRoles) {
        audit(actor, target, roles, action, AuditResult.SUCCESS, "ROLE_ASSIGNMENT_UPDATED", reason, actorRoles);
    }

    private void auditDenied(Users actor, Users target, Set<AdminRole> roles, String action,
                             String reasonCode, String reason, Set<AdminRole> actorRoles) {
        audit(actor, target, roles, action, AuditResult.FAILURE, reasonCode, reason, actorRoles);
    }

    private void auditRejected(PrincipalDetails principal, UUID targetPublicId,
                               AdminAccessDtos.DesiredSetRequest request, String reasonCode) {
        Users actor = principal.getUsers();
        java.util.Collection<?> actorRoles = principal.getAdminRoles().isEmpty()
                ? List.of(actor.getRole()) : principal.getAdminRoles();
        boolean assignmentRequested = request != null && request.assignments() != null
                && !request.assignments().isEmpty();
        auditEventService.appendEvent(actor.getId(), actor.getRole(), actorRoles,
                assignmentRequested ? "ADMIN_ROLE_ASSIGN" : "ADMIN_ROLE_REVOKE", "ADMIN_ROLE",
                targetPublicId.toString(), AuditResult.FAILURE, reasonCode,
                auditReason(request == null ? null : request.reason()), UUID.randomUUID().toString(), OffsetDateTime.now());
    }

    private void audit(Users actor, Users target, Set<AdminRole> roles, String action, AuditResult result,
                       String reasonCode, String reason, Set<AdminRole> actorRoles) {
        if (roles.isEmpty()) return;
        java.util.Collection<?> auditActorRoles = actorRoles.isEmpty() ? List.of(actor.getRole()) : actorRoles;
        auditEventService.appendEvent(actor.getId(), actor.getRole(), auditActorRoles, action, "ADMIN_ROLE",
                target.getPublicId().toString(), result, reasonCode, reason,
                UUID.randomUUID().toString(), OffsetDateTime.now());
    }

    private String normalizeReason(String reason) {
        if (reason == null) return null;
        String normalized = reason.replaceAll("\\p{Cntrl}+", " ").replaceAll("\\s+", " ").trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String auditReason(String reason) {
        String normalized = normalizeReason(reason);
        if (normalized == null || normalized.length() < 2) return null;
        return normalized.length() <= 200 ? normalized : normalized.substring(0, 200).trim();
    }

    public record RoleUpdateResult(AdminAccessDtos.UserRolesResponse response, String errorCode, String message) {
        public static RoleUpdateResult success(AdminAccessDtos.UserRolesResponse response) { return new RoleUpdateResult(response, null, null); }
        public static RoleUpdateResult error(String code, String message) { return new RoleUpdateResult(null, code, message); }
        public boolean isSuccess() { return errorCode == null; }
    }

    private record DesiredAssignments(Map<AdminRole, OffsetDateTime> assignments, String errorCode, String message) {
        static DesiredAssignments success(Map<AdminRole, OffsetDateTime> assignments) { return new DesiredAssignments(assignments, null, null); }
        static DesiredAssignments error(String code, String message) { return new DesiredAssignments(Map.of(), code, message); }
    }
}
