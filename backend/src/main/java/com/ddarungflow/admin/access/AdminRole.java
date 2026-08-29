package com.ddarungflow.admin.access;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

import static com.ddarungflow.admin.access.AdminPermission.*;

public enum AdminRole {
    OPS_VIEWER("수급 현황 조회", "상황판·지도·후보·분석 읽기", AdminConsole.OPS,
            permissions(OPS_DASHBOARD_READ, OPS_RISK_MAP_READ, OPS_CANDIDATE_READ, OPS_ANALYSIS_READ, DATA_STATUS_READ)),
    OPS_OPERATOR("운영 검토 수행", "관찰 대상·메모·리포트 관리", AdminConsole.OPS,
            permissions(OPS_DASHBOARD_READ, OPS_RISK_MAP_READ, OPS_CANDIDATE_READ, OPS_ANALYSIS_READ,
                    DATA_STATUS_READ, OPS_CANDIDATE_MANAGE, OPS_REPORT_EXPORT)),
    OPS_MANAGER("운영 기준 관리", "운영 임계값·후보 정책 승인", AdminConsole.OPS,
            permissions(OPS_DASHBOARD_READ, OPS_RISK_MAP_READ, OPS_CANDIDATE_READ, OPS_ANALYSIS_READ,
                    DATA_STATUS_READ, OPS_CANDIDATE_MANAGE, OPS_REPORT_EXPORT, OPS_THRESHOLD_MANAGE, OPS_SCENARIO_READ)),
    DATA_ANALYST("데이터 품질·분석", "데이터 상태·Export·모델 지표 읽기", AdminConsole.OPS,
            permissions(DATA_STATUS_READ, DATA_EXPORT_REQUEST, DATA_EXPORT_DOWNLOAD, DATA_ISSUE_ACKNOWLEDGE,
                    OPS_ANALYSIS_READ, MODEL_METRICS_READ, MODEL_DIAGNOSTICS_READ)),
    MODEL_ENGINEER("모델 준비·검증", "artifact 등록·validate", AdminConsole.MODEL,
            permissions(MODEL_METRICS_READ, MODEL_DIAGNOSTICS_READ, MODEL_ARTIFACT_REGISTER, MODEL_VALIDATE, MODEL_RELEASE_READ)),
    MODEL_APPROVER("모델 승인·배포", "approve/reject·activate·rollback", AdminConsole.MODEL,
            permissions(MODEL_METRICS_READ, MODEL_DIAGNOSTICS_READ, MODEL_APPROVE, MODEL_ACTIVATE, MODEL_ROLLBACK, MODEL_RELEASE_READ)),
    SUPPORT_OPERATOR("사용자 문의 처리", "Q&A 읽기·답변·상태·숨김", AdminConsole.SYSTEM,
            permissions(QNA_READ, QNA_ANSWER, QNA_STATE_CHANGE, QNA_HIDE)),
    AUDITOR("변경 이력 검토", "감사 로그 읽기 전용", AdminConsole.SYSTEM,
            permissions(AUDIT_READ, SYSTEM_STATUS_READ)),
    ACCESS_ADMIN("세부 역할 관리", "역할 부여·회수·보호 규칙", AdminConsole.SYSTEM,
            permissions(ACCESS_READ, ACCESS_ASSIGN, ACCESS_REVOKE, AUDIT_READ)),
    SUPER_ADMIN("비상 복구·최종 관리", "모든 권한, 강한 보호·감사", AdminConsole.OPS,
            Collections.unmodifiableSet(EnumSet.allOf(AdminPermission.class)));

    private final String displayName;
    private final String description;
    private final AdminConsole defaultConsole;
    private final Set<AdminPermission> permissions;

    AdminRole(String displayName, String description, AdminConsole defaultConsole, Set<AdminPermission> permissions) {
        this.displayName = displayName;
        this.description = description;
        this.defaultConsole = defaultConsole;
        this.permissions = permissions;
    }

    public String displayName() { return displayName; }
    public String description() { return description; }
    public AdminConsole defaultConsole() { return defaultConsole; }
    public Set<AdminPermission> permissions() { return permissions; }
    public boolean systemRole() { return true; }
    public boolean protectedRole() { return this == ACCESS_ADMIN || this == SUPER_ADMIN; }

    private static Set<AdminPermission> permissions(AdminPermission first, AdminPermission... rest) {
        EnumSet<AdminPermission> values = EnumSet.of(first, rest);
        return Collections.unmodifiableSet(values);
    }
}
