import OperationsOverview from '../operations/overview/index.jsx';
import OperationsRiskMap from '../operations/risk-map/index.jsx';
import OperationsCandidates from '../operations/candidates/index.jsx';
import OperationsAnalysis from '../operations/analysis/index.jsx';
import OperationsData from '../operations/data/index.jsx';
import OperationsReports from '../operations/reports/index.jsx';
import OperationsDigitalTwin from '../operations/digital-twin/index.jsx';
import ModelOverview from '../model/overview/index.jsx';
import ModelPerformance from '../model/performance/index.jsx';
import ModelDiagnostics from '../model/diagnostics/index.jsx';
import ModelReleases from '../model/releases/index.jsx';
import SystemSupport from '../system/support/index.jsx';
import SystemAccess from '../system/access/index.jsx';
import SystemAudit from '../system/audit/index.jsx';
import SystemHealth from '../system/health/index.jsx';
import SystemJourneyOps from '../system/journey-ops/index.jsx';
import { CONSOLE_ORDER, hasPermission, PERMISSIONS } from '../permissions/permissions.js';

export const PREVIEW_PREFIX = '/admin-v2-preview';
export const PRODUCTION_RELEASED_ROUTE_IDS = ['UI-OPS-01', 'UI-OPS-02', 'UI-OPS-03', 'UI-OPS-04', 'UI-OPS-05', 'UI-MODEL-01', 'UI-MODEL-04', 'UI-SYS-01', 'UI-SYS-02', 'UI-SYS-03'];
export const ROUTES = [
  ['UI-OPS-01', 'OPS', '/admin/ops', '/ops', '운영 상황판', 'OPS_DASHBOARD_READ', OperationsOverview],
  ['UI-OPS-02', 'OPS', '/admin/ops/risk-map', '/ops/risk-map', '수급 위험 지도', 'OPS_RISK_MAP_READ', OperationsRiskMap],
  ['UI-OPS-03', 'OPS', '/admin/ops/candidates', '/ops/candidates', '집중관리 목록', 'OPS_CANDIDATE_READ', OperationsCandidates],
  ['UI-OPS-04', 'OPS', '/admin/ops/analysis', '/ops/analysis', '반복 품절 패턴', 'OPS_ANALYSIS_READ', OperationsAnalysis],
  ['UI-OPS-05', 'OPS', '/admin/ops/data', '/ops/data', '운영 데이터 상태', 'DATA_STATUS_READ', OperationsData],
  ['UI-OPS-06', 'OPS', '/admin/ops/reports', '/ops/reports', '운영 리포트', 'OPS_REPORT_EXPORT', OperationsReports],
  ['UI-OPS-07', 'OPS', '/admin/ops/digital-twin', '/ops/digital-twin', '디지털 트윈', 'OPS_SCENARIO_READ', OperationsDigitalTwin],
  ['UI-MODEL-01', 'MODEL', '/admin/models', '/models', '모델 운영 현황', 'MODEL_METRICS_READ', ModelOverview],
  ['UI-MODEL-02', 'MODEL', '/admin/models/performance', '/models/performance', '성능·신뢰도', 'MODEL_METRICS_READ', ModelPerformance],
  ['UI-MODEL-03', 'MODEL', '/admin/models/diagnostics', '/models/diagnostics', '세그먼트·대여소 진단', 'MODEL_DIAGNOSTICS_READ', ModelDiagnostics],
  ['UI-MODEL-04', 'MODEL', '/admin/models/releases', '/models/releases', '모델 버전 관리', 'MODEL_RELEASE_READ', ModelReleases],
  ['UI-SYS-01', 'SYSTEM', '/admin/system/support', '/system/support', '사용자 문의', 'QNA_READ', SystemSupport],
  ['UI-SYS-02', 'SYSTEM', '/admin/system/access', '/system/access', '관리자 역할·권한', 'ACCESS_READ', SystemAccess],
  ['UI-SYS-03', 'SYSTEM', '/admin/system/audit', '/system/audit', '관리자 변경 이력', 'AUDIT_READ', SystemAudit],
  ['UI-SYS-04', 'SYSTEM', '/admin/system/health', '/system/health', '서비스 상태', 'SYSTEM_STATUS_READ', SystemHealth],
  ['UI-SYS-05', 'SYSTEM', '/admin/system/journey-ops', '/system/journey-ops', 'AI·도구 운영', 'AI_OPS_READ', SystemJourneyOps],
].map(([id, console, canonicalPath, previewSuffix, title, requiredPermission, Component]) => ({ id, console, canonicalPath, previewPath: `${PREVIEW_PREFIX}${previewSuffix}`, title, requiredPermission, Component }));

export function validateRouteMetadata(routes = ROUTES) {
  const fields = ['id', 'canonicalPath', 'previewPath', 'title'];
  return fields.every((field) => new Set(routes.map((route) => route[field])).size === routes.length)
    && routes.every((route) => PERMISSIONS.includes(route.requiredPermission));
}

export function routesForConsole(consoleId, permissions, allowedRouteIds = null) {
  return ROUTES.filter((route) => route.console === consoleId
    && (allowedRouteIds === null || allowedRouteIds.includes(route.id))
    && hasPermission(permissions, route.requiredPermission));
}

export function visibleConsoles(permissions, allowedRouteIds = null) {
  return CONSOLE_ORDER.filter((consoleId) => routesForConsole(consoleId, permissions, allowedRouteIds).length > 0);
}

export function defaultRoute(access, allowedRouteIds = null) {
  const preferred = routesForConsole(access.defaultConsole, access.permissions, allowedRouteIds)[0];
  return preferred || CONSOLE_ORDER.map((consoleId) => routesForConsole(consoleId, access.permissions, allowedRouteIds)[0]).find(Boolean) || null;
}

export function resolvePreviewRoute(pathname, access) {
  if (pathname === PREVIEW_PREFIX || pathname === `${PREVIEW_PREFIX}/`) return { type: 'REDIRECT', route: defaultRoute(access) };
  const route = ROUTES.find((candidate) => candidate.previewPath === pathname);
  if (!route) return { type: 'NOT_FOUND' };
  return hasPermission(access.permissions, route.requiredPermission) ? { type: 'ALLOW', route } : { type: 'FORBIDDEN', route };
}

export function resolveCanonicalRoute(pathname, access, releasedRouteIds = PRODUCTION_RELEASED_ROUTE_IDS) {
  const route = ROUTES.find((candidate) => candidate.canonicalPath === pathname);
  if (!route) return { type: 'NOT_FOUND' };
  if (!releasedRouteIds.includes(route.id)) return { type: 'RELEASE_NOT_AVAILABLE', route };
  return hasPermission(access.permissions, route.requiredPermission) ? { type: 'ALLOW', route } : { type: 'FORBIDDEN', route };
}

export function isAdminV2ProductionPath(pathname) {
  return pathname.startsWith('/admin/');
}

export function isAdminV2PreviewPath(pathname, nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== 'production' && (pathname === PREVIEW_PREFIX || pathname.startsWith(`${PREVIEW_PREFIX}/`));
}
