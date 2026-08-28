import OperationsOverview from '../operations/overview';
import OperationsRiskMap from '../operations/risk-map';
import OperationsCandidates from '../operations/candidates';
import OperationsAnalysis from '../operations/analysis';
import OperationsData from '../operations/data';
import OperationsReports from '../operations/reports';
import OperationsDigitalTwin from '../operations/digital-twin';
import ModelOverview from '../model/overview';
import ModelPerformance from '../model/performance';
import ModelDiagnostics from '../model/diagnostics';
import ModelReleases from '../model/releases';
import SystemSupport from '../system/support';
import SystemAccess from '../system/access';
import SystemAudit from '../system/audit';
import SystemHealth from '../system/health';
import SystemJourneyOps from '../system/journey-ops';
import { CONSOLE_ORDER, hasPermission, PERMISSIONS } from '../permissions/permissions';

export const PREVIEW_PREFIX = '/admin-v2-preview';
export const ROUTES = [
  ['UI-OPS-01', 'OPS', '/admin/ops', '/ops', '운영 상황판', 'OPS_DASHBOARD_READ', OperationsOverview],
  ['UI-OPS-02', 'OPS', '/admin/ops/risk-map', '/ops/risk-map', '수급 위험 지도', 'OPS_RISK_MAP_READ', OperationsRiskMap],
  ['UI-OPS-03', 'OPS', '/admin/ops/candidates', '/ops/candidates', '집중관리 후보', 'OPS_CANDIDATE_READ', OperationsCandidates],
  ['UI-OPS-04', 'OPS', '/admin/ops/analysis', '/ops/analysis', '지역·시간대 분석', 'OPS_ANALYSIS_READ', OperationsAnalysis],
  ['UI-OPS-05', 'OPS', '/admin/ops/data', '/ops/data', '데이터 상태', 'DATA_STATUS_READ', OperationsData],
  ['UI-OPS-06', 'OPS', '/admin/ops/reports', '/ops/reports', '운영 리포트', 'OPS_REPORT_EXPORT', OperationsReports],
  ['UI-OPS-07', 'OPS', '/admin/ops/digital-twin', '/ops/digital-twin', '디지털 트윈', 'OPS_SCENARIO_READ', OperationsDigitalTwin],
  ['UI-MODEL-01', 'MODEL', '/admin/models', '/models', '모델 현황', 'MODEL_METRICS_READ', ModelOverview],
  ['UI-MODEL-02', 'MODEL', '/admin/models/performance', '/models/performance', '성능·신뢰도', 'MODEL_METRICS_READ', ModelPerformance],
  ['UI-MODEL-03', 'MODEL', '/admin/models/diagnostics', '/models/diagnostics', '세그먼트·대여소 진단', 'MODEL_DIAGNOSTICS_READ', ModelDiagnostics],
  ['UI-MODEL-04', 'MODEL', '/admin/models/releases', '/models/releases', '배포·복원', 'MODEL_RELEASE_READ', ModelReleases],
  ['UI-SYS-01', 'SYSTEM', '/admin/system/support', '/system/support', '문의 관리', 'QNA_READ', SystemSupport],
  ['UI-SYS-02', 'SYSTEM', '/admin/system/access', '/system/access', '계정·권한', 'ACCESS_READ', SystemAccess],
  ['UI-SYS-03', 'SYSTEM', '/admin/system/audit', '/system/audit', '감사 로그', 'AUDIT_READ', SystemAudit],
  ['UI-SYS-04', 'SYSTEM', '/admin/system/health', '/system/health', '서비스 상태', 'SYSTEM_STATUS_READ', SystemHealth],
  ['UI-SYS-05', 'SYSTEM', '/admin/system/journey-ops', '/system/journey-ops', 'AI·도구 운영', 'AI_OPS_READ', SystemJourneyOps],
].map(([id, console, canonicalPath, previewSuffix, title, requiredPermission, Component]) => ({ id, console, canonicalPath, previewPath: `${PREVIEW_PREFIX}${previewSuffix}`, title, requiredPermission, Component }));

export function validateRouteMetadata(routes = ROUTES) {
  const fields = ['id', 'canonicalPath', 'previewPath', 'title'];
  return fields.every((field) => new Set(routes.map((route) => route[field])).size === routes.length)
    && routes.every((route) => PERMISSIONS.includes(route.requiredPermission));
}

export function routesForConsole(consoleId, permissions) {
  return ROUTES.filter((route) => route.console === consoleId && hasPermission(permissions, route.requiredPermission));
}

export function visibleConsoles(permissions) {
  return CONSOLE_ORDER.filter((consoleId) => routesForConsole(consoleId, permissions).length > 0);
}

export function defaultRoute(access) {
  const preferred = routesForConsole(access.defaultConsole, access.permissions)[0];
  return preferred || CONSOLE_ORDER.map((consoleId) => routesForConsole(consoleId, access.permissions)[0]).find(Boolean) || null;
}

export function resolvePreviewRoute(pathname, access) {
  if (pathname === PREVIEW_PREFIX || pathname === `${PREVIEW_PREFIX}/`) return { type: 'REDIRECT', route: defaultRoute(access) };
  const route = ROUTES.find((candidate) => candidate.previewPath === pathname);
  if (!route) return { type: 'NOT_FOUND' };
  return hasPermission(access.permissions, route.requiredPermission) ? { type: 'ALLOW', route } : { type: 'FORBIDDEN', route };
}

export function isAdminV2PreviewPath(pathname, nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== 'production' && (pathname === PREVIEW_PREFIX || pathname.startsWith(`${PREVIEW_PREFIX}/`));
}
