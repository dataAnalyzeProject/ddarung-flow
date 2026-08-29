package com.ddarungflow.admin.access;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static com.ddarungflow.admin.access.AdminPermission.*;
import static org.assertj.core.api.Assertions.assertThat;

class AdminRoleMatrixTest {
    @Test
    void allTenRolesHaveTheApprovedPermissionBundlesAndNoImplicitPermissions() {
        Map<AdminRole, Set<AdminPermission>> expected = Map.of(
                AdminRole.OPS_VIEWER, Set.of(OPS_DASHBOARD_READ, OPS_RISK_MAP_READ, OPS_CANDIDATE_READ, OPS_ANALYSIS_READ, DATA_STATUS_READ),
                AdminRole.OPS_OPERATOR, Set.of(OPS_DASHBOARD_READ, OPS_RISK_MAP_READ, OPS_CANDIDATE_READ, OPS_ANALYSIS_READ, DATA_STATUS_READ, OPS_CANDIDATE_MANAGE, OPS_REPORT_EXPORT),
                AdminRole.OPS_MANAGER, Set.of(OPS_DASHBOARD_READ, OPS_RISK_MAP_READ, OPS_CANDIDATE_READ, OPS_ANALYSIS_READ, DATA_STATUS_READ, OPS_CANDIDATE_MANAGE, OPS_REPORT_EXPORT, OPS_THRESHOLD_MANAGE, OPS_SCENARIO_READ),
                AdminRole.DATA_ANALYST, Set.of(DATA_STATUS_READ, DATA_EXPORT_REQUEST, DATA_EXPORT_DOWNLOAD, DATA_ISSUE_ACKNOWLEDGE, OPS_ANALYSIS_READ, MODEL_METRICS_READ, MODEL_DIAGNOSTICS_READ),
                AdminRole.MODEL_ENGINEER, Set.of(MODEL_METRICS_READ, MODEL_DIAGNOSTICS_READ, MODEL_ARTIFACT_REGISTER, MODEL_VALIDATE, MODEL_RELEASE_READ),
                AdminRole.MODEL_APPROVER, Set.of(MODEL_METRICS_READ, MODEL_DIAGNOSTICS_READ, MODEL_APPROVE, MODEL_ACTIVATE, MODEL_ROLLBACK, MODEL_RELEASE_READ),
                AdminRole.SUPPORT_OPERATOR, Set.of(QNA_READ, QNA_ANSWER, QNA_STATE_CHANGE, QNA_HIDE),
                AdminRole.AUDITOR, Set.of(AUDIT_READ, SYSTEM_STATUS_READ),
                AdminRole.ACCESS_ADMIN, Set.of(ACCESS_READ, ACCESS_ASSIGN, ACCESS_REVOKE, AUDIT_READ),
                AdminRole.SUPER_ADMIN, Set.of(AdminPermission.values())
        );

        assertThat(AdminRole.values()).hasSize(10);
        assertThat(AdminPermission.values()).hasSize(30);
        expected.forEach((role, permissions) -> assertThat(role.permissions()).containsExactlyInAnyOrderElementsOf(permissions));
    }

    @Test
    void defaultConsoleUsesFirstAllowedRouteInOpsModelSystemOrder() {
        assertThat(AdminAuthorityService.defaultConsole(Set.of(ACCESS_READ))).isEqualTo(AdminConsole.SYSTEM);
        assertThat(AdminAuthorityService.defaultConsole(Set.of(MODEL_METRICS_READ, ACCESS_READ))).isEqualTo(AdminConsole.MODEL);
        assertThat(AdminAuthorityService.defaultConsole(Set.of(OPS_ANALYSIS_READ, MODEL_METRICS_READ, ACCESS_READ))).isEqualTo(AdminConsole.OPS);
        assertThat(AdminAuthorityService.defaultConsole(Set.of())).isNull();
    }
}
