package com.ddarungflow.admin.access;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminAuthorityService {
    private static final Set<AdminPermission> OPS_ROUTES = Set.of(
            AdminPermission.OPS_DASHBOARD_READ, AdminPermission.OPS_RISK_MAP_READ,
            AdminPermission.OPS_CANDIDATE_READ, AdminPermission.OPS_ANALYSIS_READ,
            AdminPermission.DATA_STATUS_READ, AdminPermission.OPS_REPORT_EXPORT,
            AdminPermission.OPS_SCENARIO_READ);
    private static final Set<AdminPermission> MODEL_ROUTES = Set.of(
            AdminPermission.MODEL_METRICS_READ, AdminPermission.MODEL_DIAGNOSTICS_READ,
            AdminPermission.MODEL_RELEASE_READ);
    private static final Set<AdminPermission> SYSTEM_ROUTES = Set.of(
            AdminPermission.QNA_READ, AdminPermission.ACCESS_READ, AdminPermission.AUDIT_READ,
            AdminPermission.SYSTEM_STATUS_READ, AdminPermission.AI_OPS_READ);

    private final AdminUserRoleRepository adminUserRoleRepository;

    public AdminAuthoritySnapshot load(Users user) {
        OffsetDateTime now = OffsetDateTime.now();
        if (user == null || user.getRole() != UserRole.ADMIN) {
            return new AdminAuthoritySnapshot(Set.of(), Set.of(), null, now);
        }

        EnumSet<AdminRole> roles = EnumSet.noneOf(AdminRole.class);
        EnumSet<AdminPermission> permissions = EnumSet.noneOf(AdminPermission.class);
        for (AdminUserRole assignment : adminUserRoleRepository.findActiveByUserId(user.getId(), now)) {
            roles.add(assignment.getRoleCode());
            permissions.addAll(assignment.getRoleCode().permissions());
        }
        return new AdminAuthoritySnapshot(Collections.unmodifiableSet(roles), Collections.unmodifiableSet(permissions),
                defaultConsole(permissions), now);
    }

    public static AdminConsole defaultConsole(Set<AdminPermission> permissions) {
        if (permissions.stream().anyMatch(OPS_ROUTES::contains)) return AdminConsole.OPS;
        if (permissions.stream().anyMatch(MODEL_ROUTES::contains)) return AdminConsole.MODEL;
        if (permissions.stream().anyMatch(SYSTEM_ROUTES::contains)) return AdminConsole.SYSTEM;
        return null;
    }
}
