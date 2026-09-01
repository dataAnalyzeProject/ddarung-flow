import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import AdminV2PreviewApp from './shell/AdminV2PreviewApp';
import AdminConsoleSwitcher from './components/AdminConsoleSwitcher';
import AccessibleTable from './components/AccessibleTable';
import DetailDrawer from './components/DetailDrawer';
import ReasonDialog from './components/ReasonDialog';
import AsyncStatePanel from './components/AsyncStatePanel';
import { createFixtureAdminAccessAdapter } from './adapters/fixtureAdminAccessAdapter';
import { ASYNC_STATES } from './states/adminStates';
import { defaultRoute, isAdminV2PreviewPath, isAdminV2ProductionPath, PRODUCTION_RELEASED_ROUTE_IDS, resolveCanonicalRoute, resolvePreviewRoute, ROUTES, routesForConsole, validateRouteMetadata, visibleConsoles } from './routes/routeMap';

function setPreviewUrl(path) { window.history.replaceState({}, '', path); }
async function waitForShell() { await waitFor(() => expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument()); }
function readyAccess(adminRoles, permissions, defaultConsole = 'OPS') { return { state: 'READY', adminRoles, permissions, defaultConsole, generatedAt: '2026-08-28T09:00:00Z', source: 'FIXTURE' }; }
const originalMatchMedia = window.matchMedia;

function mockMatchMedia(initialMatches) {
  let matches = initialMatches;
  const listeners = new Set();
  const mediaQuery = {
    media: '(max-width: 960px)',
    get matches() { return matches; },
    addEventListener: jest.fn((event, listener) => { if (event === 'change') listeners.add(listener); }),
    removeEventListener: jest.fn((event, listener) => { if (event === 'change') listeners.delete(listener); }),
  };
  window.matchMedia = jest.fn(() => mediaQuery);
  return { change(nextMatches) { matches = nextMatches; listeners.forEach((listener) => listener({ matches, media: mediaQuery.media })); } };
}

const FORBIDDEN_FIXTURE_KEYS = new Set([
  'email', 'oauthid', 'oauth', 'providerid', 'provider', 'internaluserid',
  'token', 'accesstoken', 'refreshtoken', 'objectkey', 'binarypath',
]);
const FORBIDDEN_FIXTURE_VALUE_PATTERNS = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['bearer token', /\bbearer\s+[A-Z0-9._~+/=-]{8,}\b/i],
  ['object storage key', /(?:\b(?:gs|oci|oss|s3|object-storage):\/\/\S+|^[A-Z0-9._-]+(?:\/[A-Z0-9._-]+)+$)/i],
  ['binary path', /(?:[A-Z]:\\|\/)[^\s]*(?:\.bin|\.onnx|\.pkl|\.joblib|\.pt|\.pth)\b/i],
];

function expectSensitiveFixtureDataAbsent(value, path = 'fixture') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectSensitiveFixtureDataAbsent(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      if (FORBIDDEN_FIXTURE_KEYS.has(key.toLowerCase())) {
        throw new Error(`${path}.${key} is a forbidden fixture key`);
      }
      expectSensitiveFixtureDataAbsent(nested, `${path}.${key}`);
    });
    return;
  }
  if (typeof value === 'string') {
    FORBIDDEN_FIXTURE_VALUE_PATTERNS.forEach(([label, pattern]) => {
      if (pattern.test(value)) {
        throw new Error(`${path} contains a ${label}`);
      }
    });
  }
}

afterEach(() => { setPreviewUrl('/'); window.matchMedia = originalMatchMedia; });

describe('admin v2 fixture access and routes', () => {
  test.each([
    ['OPS_VIEWER', ['OPS']], ['OPS_OPERATOR', ['OPS']], ['OPS_MANAGER', ['OPS']], ['DATA_ANALYST', ['OPS', 'MODEL']],
    ['MODEL_ENGINEER', ['MODEL']], ['MODEL_APPROVER', ['MODEL']], ['SUPPORT_OPERATOR', ['SYSTEM']], ['AUDITOR', ['SYSTEM']],
    ['ACCESS_ADMIN', ['SYSTEM']], ['SUPER_ADMIN', ['OPS', 'MODEL', 'SYSTEM']],
  ])('%s exposes only permission-derived consoles', async (fixtureId, expectedConsoles) => {
    const access = await createFixtureAdminAccessAdapter({ fixtureId }).load();
    expect(visibleConsoles(access.permissions)).toEqual(expectedConsoles);
    expect(defaultRoute(access)).not.toBeNull();
  });

  test.each([
    'OPS_VIEWER', 'OPS_OPERATOR', 'OPS_MANAGER', 'DATA_ANALYST', 'MODEL_ENGINEER',
    'MODEL_APPROVER', 'SUPPORT_OPERATOR', 'AUDITOR', 'ACCESS_ADMIN', 'SUPER_ADMIN',
    'AUTH_REQUIRED', 'ADMIN_ACCESS_DENIED', 'ACCESS_ERROR', 'UNKNOWN',
  ])('%s fixture contains no forbidden sensitive keys or values', async (fixtureId) => {
    const access = await createFixtureAdminAccessAdapter({ fixtureId }).load();
    expectSensitiveFixtureDataAbsent(access, fixtureId);
  });

  test('publicUserId remains an allowed fixture field', () => {
    expect(() => expectSensitiveFixtureDataAbsent({ publicUserId: 'public-user-1' })).not.toThrow();
  });

  test('sensitive fixture detector rejects a relative object storage key', () => {
    expect(() => expectSensitiveFixtureDataAbsent({ artifact: 'models/test.joblib' })).toThrow('object storage key');
  });

  test('root redirects with replaceState to the first permitted preview route and preserves query', async () => {
    setPreviewUrl('/admin-v2-preview?fixture=MODEL_ENGINEER&mode=review');
    const replaceSpy = jest.spyOn(window.history, 'replaceState');
    render(<AdminV2PreviewApp />);
    await waitFor(() => expect(window.location.pathname).toBe('/admin-v2-preview/models'));
    expect(window.location.search).toBe('?fixture=MODEL_ENGINEER&mode=review');
    expect(replaceSpy).toHaveBeenLastCalledWith({}, '', '/admin-v2-preview/models?fixture=MODEL_ENGINEER&mode=review');
    expect(screen.getByText('UI-MODEL-01')).toBeInTheDocument();
    replaceSpy.mockRestore();
  });

  test('menu and console navigation push pathname while preserving fixture query', async () => {
    setPreviewUrl('/admin-v2-preview/ops?fixture=SUPER_ADMIN&mode=review&opsFixture=SUCCESS&riskMapFixture=SUCCESS');
    render(<AdminV2PreviewApp />);
    await waitForShell();
    fireEvent.click(screen.getByRole('button', { name: '수급 위험 지도' }));
    expect(window.location.pathname).toBe('/admin-v2-preview/ops/risk-map');
    expect(window.location.search).toBe('?fixture=SUPER_ADMIN&mode=review&opsFixture=SUCCESS&riskMapFixture=SUCCESS');
    fireEvent.click(screen.getByRole('button', { name: '모델' }));
    expect(window.location.pathname).toBe('/admin-v2-preview/models');
    expect(window.location.search).toBe('?fixture=SUPER_ADMIN&mode=review&opsFixture=SUCCESS&riskMapFixture=SUCCESS');
    expect(screen.getByText('UI-MODEL-01')).toBeInTheDocument();
  });

  test('preview supplies a read-only fixture adapter to every redesigned route without a page-specific fixture', async () => {
    setPreviewUrl('/admin-v2-preview/ops/candidates?fixture=SUPER_ADMIN');
    render(<AdminV2PreviewApp />);
    expect(await screen.findByRole('heading', { name: '집중관리 목록' })).toBeInTheDocument();
    expect(screen.queryByText('오류가 발생했습니다')).not.toBeInTheDocument();
  });

  test('popstate restores the previous preview route', async () => {
    setPreviewUrl('/admin-v2-preview/ops?fixture=OPS_VIEWER&opsFixture=SUCCESS');
    render(<AdminV2PreviewApp />);
    await waitForShell();
    window.history.pushState({}, '', '/admin-v2-preview/ops/risk-map?fixture=OPS_VIEWER&riskMapFixture=SUCCESS');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
    window.history.pushState({}, '', '/admin-v2-preview/ops?fixture=OPS_VIEWER&opsFixture=SUCCESS');
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
  });

  test('a changed pathname prop replaces the active route without relying on a stale browser path', async () => {
    const { rerender } = render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" />);
    await waitForShell();
    rerender(<AdminV2PreviewApp pathname="/admin-v2-preview/ops/risk-map" search="?fixture=OPS_VIEWER&riskMapFixture=SUCCESS" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument());
  });

  test('direct URL with no permission is forbidden and renders no domain placeholder', async () => {
    setPreviewUrl('/admin-v2-preview/models/releases?fixture=OPS_VIEWER');
    render(<AdminV2PreviewApp />);
    await waitForShell();
    expect(screen.getByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: MODEL_RELEASE_READ')).toBeInTheDocument();
    expect(screen.queryByText('UI-MODEL-04')).not.toBeInTheDocument();
    expect(screen.queryByText('FIXTURE / API_NOT_CONNECTED')).not.toBeInTheDocument();
  });

  test.each([
    ['AUTH_REQUIRED', '관리자 로그인이 필요합니다.', '로그인 후 관리자 콘솔을 이용할 수 있습니다.'],
    ['ADMIN_ACCESS_DENIED', '관리자 콘솔 접근 권한이 없습니다.', '일반 서비스로 돌아가 주세요.'],
    ['ACCESS_ERROR', '관리자 권한 정보를 불러오지 못했습니다.', '잠시 후 다시 시도해 주세요.'],
  ])('%s has distinct safe access copy and no navigation or route data', async (fixtureId, title, description) => {
    setPreviewUrl(`/admin-v2-preview/ops?fixture=${fixtureId}`);
    render(<AdminV2PreviewApp />);
    await waitForShell();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '관리자 메뉴' })).not.toBeInTheDocument();
  });

  test('unknown fixture is ACCESS_ERROR, not a privileged fallback', async () => {
    setPreviewUrl('/admin-v2-preview/ops?fixture=UNKNOWN');
    render(<AdminV2PreviewApp />);
    await waitForShell();
    expect(screen.getByText('관리자 권한 정보를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  test('a source change clears stale OPS data and late completion cannot overwrite new access', async () => {
    const resolvers = {};
    const createAccessAdapter = ({ fixtureId }) => ({ load: () => new Promise((resolve) => { resolvers[fixtureId] = resolve; }) });
    const { rerender } = render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={createAccessAdapter} />);
    await waitFor(() => expect(resolvers.OPS_VIEWER).toBeDefined());
    rerender(<AdminV2PreviewApp pathname="/admin-v2-preview/system/access" search="?fixture=ACCESS_ADMIN" createAccessAdapter={createAccessAdapter} />);
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    await waitFor(() => expect(resolvers.ACCESS_ADMIN).toBeDefined());
    await act(async () => resolvers.ACCESS_ADMIN(readyAccess(['NOT_A_ROUTE_ROLE'], ['ACCESS_READ'], 'SYSTEM')));
    expect(screen.getByText('UI-SYS-02')).toBeInTheDocument();
    await act(async () => resolvers.OPS_VIEWER(readyAccess(['NOT_A_ROUTE_ROLE'], ['OPS_DASHBOARD_READ'])));
    expect(screen.getByText('UI-SYS-02')).toBeInTheDocument();
  });

  test('an adapter source change is immediately loading even when the fixture is unchanged', async () => {
    const firstAdapter = () => ({ load: () => Promise.resolve(readyAccess(['NOT_A_ROUTE_ROLE'], ['OPS_DASHBOARD_READ'])) });
    const secondAdapter = () => ({ load: () => new Promise(() => {}) });
    setPreviewUrl('/admin-v2-preview/ops?fixture=OPS_VIEWER&opsFixture=SUCCESS');
    const { rerender } = render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={firstAdapter} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
    rerender(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={secondAdapter} />);
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '운영 상황판' })).not.toBeInTheDocument();
  });

  test('adapter rejection converges to the safe access error and unmount ignores late completion', async () => {
    let resolve;
    const delayedAdapter = () => ({ load: () => new Promise((done) => { resolve = done; }) });
    const { unmount } = render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={delayedAdapter} />);
    await waitFor(() => expect(resolve).toBeDefined());
    unmount();
    await act(async () => resolve(readyAccess(['NOT_A_ROUTE_ROLE'], ['OPS_DASHBOARD_READ'])));
    const rejectingAdapter = () => ({ load: () => Promise.reject(new Error('unavailable')) });
    render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={rejectingAdapter} />);
    await waitFor(() => expect(screen.getByText('관리자 권한 정보를 불러오지 못했습니다.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  test.each([
    ['factory', () => { throw new Error('factory unavailable'); }],
    ['load', () => ({ load() { throw new Error('load unavailable'); } })],
  ])('%s synchronous throw converges to the safe access error', async (boundary, createAccessAdapter) => {
    render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={createAccessAdapter} />);
    await waitFor(() => expect(screen.getByText('관리자 권한 정보를 불러오지 못했습니다.')).toBeInTheDocument());
    expect(screen.getByText('ADMIN_ACCESS_UNAVAILABLE')).toBeInTheDocument();
  });

  test('retry clears route data and recovers after a synchronous failure', async () => {
    const initialAdapter = () => ({ load: () => Promise.resolve(readyAccess(['OPS_VIEWER'], ['OPS_DASHBOARD_READ'])) });
    let calls = 0;
    let resolveRetry;
    const createAccessAdapter = () => ({
      load() {
        calls += 1;
        if (calls === 1) throw new Error('first load unavailable');
        return new Promise((resolve) => { resolveRetry = resolve; });
      },
    });
    setPreviewUrl('/admin-v2-preview/ops?fixture=OPS_VIEWER&opsFixture=SUCCESS');
    const { rerender } = render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={initialAdapter} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
    rerender(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={createAccessAdapter} />);
    await waitFor(() => expect(screen.getByText('관리자 권한 정보를 불러오지 못했습니다.')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: '운영 상황판' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByText('불러오는 중')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: '운영 상황판' })).not.toBeInTheDocument();
    await waitFor(() => expect(resolveRetry).toBeDefined());
    await act(async () => resolveRetry(readyAccess(['OPS_VIEWER'], ['OPS_DASHBOARD_READ'])));
    expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  test('late previous response cannot overwrite a successful retry result', async () => {
    let resolvePrevious;
    const previousAdapter = () => ({ load: () => new Promise((resolve) => { resolvePrevious = resolve; }) });
    let retryCalls = 0;
    const retryAdapter = () => ({
      load() {
        retryCalls += 1;
        if (retryCalls === 1) return Promise.reject(new Error('retry source unavailable'));
        return Promise.resolve(readyAccess(['OPS_VIEWER'], ['OPS_DASHBOARD_READ']));
      },
    });
    setPreviewUrl('/admin-v2-preview/ops?fixture=OPS_VIEWER&opsFixture=SUCCESS');
    const { rerender } = render(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={previousAdapter} />);
    await waitFor(() => expect(resolvePrevious).toBeDefined());
    rerender(<AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" createAccessAdapter={retryAdapter} />);
    await waitFor(() => expect(screen.getByText('관리자 권한 정보를 불러오지 못했습니다.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
    await act(async () => resolvePrevious(readyAccess(['MODEL_ENGINEER'], ['MODEL_METRICS_READ'], 'MODEL')));
    expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument();
    expect(screen.queryByText('UI-MODEL-01')).not.toBeInTheDocument();
  });

  test('route metadata exactly matches the approved 15-route canonical matrix', () => {
    expect(ROUTES.map(({ id, canonicalPath, previewPath, title, console, requiredPermission }) => ({ id, canonicalPath, previewPath, title, console, requiredPermission }))).toEqual([
      { id: 'UI-OPS-01', canonicalPath: '/admin/ops', previewPath: '/admin-v2-preview/ops', title: '운영 상황판', console: 'OPS', requiredPermission: 'OPS_DASHBOARD_READ' },
      { id: 'UI-OPS-02', canonicalPath: '/admin/ops/risk-map', previewPath: '/admin-v2-preview/ops/risk-map', title: '수급 위험 지도', console: 'OPS', requiredPermission: 'OPS_RISK_MAP_READ' },
      { id: 'UI-OPS-03', canonicalPath: '/admin/ops/candidates', previewPath: '/admin-v2-preview/ops/candidates', title: '집중관리 목록', console: 'OPS', requiredPermission: 'OPS_CANDIDATE_READ' },
      { id: 'UI-OPS-04', canonicalPath: '/admin/ops/analysis', previewPath: '/admin-v2-preview/ops/analysis', title: '반복 품절 패턴', console: 'OPS', requiredPermission: 'OPS_ANALYSIS_READ' },
      { id: 'UI-OPS-05', canonicalPath: '/admin/ops/data', previewPath: '/admin-v2-preview/ops/data', title: '운영 데이터 상태', console: 'OPS', requiredPermission: 'DATA_STATUS_READ' },
      { id: 'UI-OPS-06', canonicalPath: '/admin/ops/reports', previewPath: '/admin-v2-preview/ops/reports', title: '운영 리포트', console: 'OPS', requiredPermission: 'OPS_REPORT_EXPORT' },
      { id: 'UI-OPS-07', canonicalPath: '/admin/ops/digital-twin', previewPath: '/admin-v2-preview/ops/digital-twin', title: '디지털 트윈', console: 'OPS', requiredPermission: 'OPS_SCENARIO_READ' },
      { id: 'UI-MODEL-01', canonicalPath: '/admin/models', previewPath: '/admin-v2-preview/models', title: '모델 운영 현황', console: 'MODEL', requiredPermission: 'MODEL_METRICS_READ' },
      { id: 'UI-MODEL-02', canonicalPath: '/admin/models/performance', previewPath: '/admin-v2-preview/models/performance', title: '모델 검증', console: 'MODEL', requiredPermission: 'MODEL_METRICS_READ' },
      { id: 'UI-MODEL-04', canonicalPath: '/admin/models/releases', previewPath: '/admin-v2-preview/models/releases', title: '모델 버전 관리', console: 'MODEL', requiredPermission: 'MODEL_RELEASE_READ' },
      { id: 'UI-SYS-01', canonicalPath: '/admin/system/support', previewPath: '/admin-v2-preview/system/support', title: '사용자 문의', console: 'SYSTEM', requiredPermission: 'QNA_READ' },
      { id: 'UI-SYS-02', canonicalPath: '/admin/system/access', previewPath: '/admin-v2-preview/system/access', title: '관리자 역할·권한', console: 'SYSTEM', requiredPermission: 'ACCESS_READ' },
      { id: 'UI-SYS-03', canonicalPath: '/admin/system/audit', previewPath: '/admin-v2-preview/system/audit', title: '관리자 변경 이력', console: 'SYSTEM', requiredPermission: 'AUDIT_READ' },
      { id: 'UI-SYS-04', canonicalPath: '/admin/system/health', previewPath: '/admin-v2-preview/system/health', title: '서비스 상태', console: 'SYSTEM', requiredPermission: 'SYSTEM_STATUS_READ' },
      { id: 'UI-SYS-05', canonicalPath: '/admin/system/journey-ops', previewPath: '/admin-v2-preview/system/journey-ops', title: 'AI·도구 운영', console: 'SYSTEM', requiredPermission: 'AI_OPS_READ' },
    ]);
    expect(validateRouteMetadata()).toBe(true);
    expect(ROUTES.find(({ id }) => id === 'UI-MODEL-03')).toBeUndefined();
    expect(resolvePreviewRoute('/admin-v2-preview/missing', { permissions: [] }).type).toBe('NOT_FOUND');
    expect(resolvePreviewRoute('/admin-v2-preview/models/diagnostics', { permissions: ['MODEL_DIAGNOSTICS_READ'] }).type).toBe('NOT_FOUND');
    expect(resolvePreviewRoute('/admin-v2-preview/ops', { adminRoles: ['SUPER_ADMIN'], permissions: [] }).type).toBe('FORBIDDEN');
  });

  test.each(ASYNC_STATES)('renders the %s common state', (state) => {
    render(<AsyncStatePanel state={state} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  test('keeps the approved nine common states and only announces async state changes', () => {
    expect(ASYNC_STATES).toEqual(['LOADING', 'SUCCESS', 'EMPTY', 'PARTIAL', 'DELAYED', 'INSUFFICIENT_DATA', 'UNAVAILABLE', 'FORBIDDEN', 'ERROR']);
    const { rerender } = render(<AsyncStatePanel state="SUCCESS" />);
    expect(screen.getByRole('region')).not.toHaveAttribute('aria-live');
    rerender(<AsyncStatePanel state="ERROR" />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-live', 'polite');
  });

  test('renders retry only when an executable retry handler is provided', () => {
    const onRetry = jest.fn();
    const { rerender } = render(<AsyncStatePanel state="ERROR" code="ADMIN_ACCESS_UNAVAILABLE" />);
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    rerender(<AsyncStatePanel state="ERROR" code="ADMIN_ACCESS_UNAVAILABLE" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('production disables the preview helper', () => {
    expect(isAdminV2PreviewPath('/admin-v2-preview/ops', 'production')).toBe(false);
    expect(isAdminV2PreviewPath('/admin-v2-preview/ops', 'test')).toBe(true);
  });

  test('canonical production routes apply the release gate before permissions', () => {
    expect(PRODUCTION_RELEASED_ROUTE_IDS).toEqual(['UI-OPS-01', 'UI-OPS-02', 'UI-OPS-03', 'UI-OPS-04', 'UI-OPS-05', 'UI-MODEL-01', 'UI-MODEL-02', 'UI-MODEL-04', 'UI-SYS-01', 'UI-SYS-02', 'UI-SYS-03']);
    expect(resolveCanonicalRoute('/admin/ops', { permissions: ['OPS_DASHBOARD_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-OPS-01' } });
    expect(resolveCanonicalRoute('/admin/ops/risk-map', { permissions: [] })).toMatchObject({ type: 'FORBIDDEN', route: { requiredPermission: 'OPS_RISK_MAP_READ' } });
    expect(resolveCanonicalRoute('/admin/ops/candidates', { permissions: ['OPS_CANDIDATE_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-OPS-03' } });
    expect(resolveCanonicalRoute('/admin/ops/analysis', { permissions: ['OPS_ANALYSIS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-OPS-04', canonicalPath: '/admin/ops/analysis', title: '반복 품절 패턴', requiredPermission: 'OPS_ANALYSIS_READ' } });
    expect(resolveCanonicalRoute('/admin/ops/analysis', { permissions: [] })).toMatchObject({ type: 'FORBIDDEN', route: { id: 'UI-OPS-04', requiredPermission: 'OPS_ANALYSIS_READ' } });
    expect(resolveCanonicalRoute('/admin/ops/data', { permissions: ['DATA_STATUS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-OPS-05', title: '운영 데이터 상태', requiredPermission: 'DATA_STATUS_READ' } });
    expect(resolveCanonicalRoute('/admin/ops/data', { permissions: [] })).toMatchObject({ type: 'FORBIDDEN', route: { id: 'UI-OPS-05', requiredPermission: 'DATA_STATUS_READ' } });
    ['UI-OPS-06', 'UI-OPS-07', 'UI-SYS-04', 'UI-SYS-05'].forEach((id) => {
      const route = ROUTES.find((candidate) => candidate.id === id);
      expect(resolveCanonicalRoute(route.canonicalPath, { permissions: [route.requiredPermission] })).toMatchObject({ type: 'RELEASE_NOT_AVAILABLE', route: { id } });
    });
    expect(resolvePreviewRoute('/admin-v2-preview/ops/analysis', { permissions: ['OPS_ANALYSIS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-OPS-04', previewPath: '/admin-v2-preview/ops/analysis' } });
    expect(resolveCanonicalRoute('/admin/models', { permissions: ['MODEL_METRICS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-MODEL-01', title: '모델 운영 현황' } });
    expect(resolveCanonicalRoute('/admin/models/performance', { permissions: ['MODEL_METRICS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-MODEL-02', canonicalPath: '/admin/models/performance', title: '모델 검증', requiredPermission: 'MODEL_METRICS_READ' } });
    expect(resolveCanonicalRoute('/admin/models/performance', { permissions: [] })).toMatchObject({ type: 'FORBIDDEN', route: { id: 'UI-MODEL-02', requiredPermission: 'MODEL_METRICS_READ' } });
    expect(resolveCanonicalRoute('/admin/models/diagnostics', { permissions: ['MODEL_DIAGNOSTICS_READ'] }).type).toBe('NOT_FOUND');
    expect(resolveCanonicalRoute('/admin/models/releases', { permissions: ['MODEL_RELEASE_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-MODEL-04', title: '모델 버전 관리', requiredPermission: 'MODEL_RELEASE_READ' } });
    expect(resolveCanonicalRoute('/admin/models/releases', { permissions: [] })).toMatchObject({ type: 'FORBIDDEN', route: { id: 'UI-MODEL-04', requiredPermission: 'MODEL_RELEASE_READ' } });
    expect(resolveCanonicalRoute('/admin/system/support', { permissions: ['QNA_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-SYS-01', title: '사용자 문의', requiredPermission: 'QNA_READ' } });
    expect(resolveCanonicalRoute('/admin/system/support', { permissions: [] })).toMatchObject({ type: 'FORBIDDEN', route: { id: 'UI-SYS-01', requiredPermission: 'QNA_READ' } });
    expect(resolveCanonicalRoute('/admin/system/access', { permissions: ['ACCESS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-SYS-02', title: '관리자 역할·권한' } });
    expect(resolveCanonicalRoute('/admin/system/audit', { permissions: ['AUDIT_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-SYS-03', title: '관리자 변경 이력' } });
    expect(resolveCanonicalRoute('/admin/not-real', { permissions: [] }).type).toBe('NOT_FOUND');
    expect(isAdminV2ProductionPath('/admin')).toBe(true);
    expect(isAdminV2ProductionPath('/admin/ops')).toBe(true);
  });

  test('route-ID discovery is conjunctive in production and unrestricted in preview', () => {
    const modelMetricsPermissions = ['MODEL_METRICS_READ'];
    const modelReleasePermissions = ['MODEL_RELEASE_READ'];
    const modelPermissions = [...modelMetricsPermissions, ...modelReleasePermissions];
    expect(routesForConsole('MODEL', modelMetricsPermissions, PRODUCTION_RELEASED_ROUTE_IDS).map(({ id }) => id)).toEqual(['UI-MODEL-01', 'UI-MODEL-02']);
    expect(routesForConsole('MODEL', modelReleasePermissions, PRODUCTION_RELEASED_ROUTE_IDS).map(({ id }) => id)).toEqual(['UI-MODEL-04']);
    expect(routesForConsole('MODEL', modelPermissions, PRODUCTION_RELEASED_ROUTE_IDS).map(({ id }) => id)).toEqual(['UI-MODEL-01', 'UI-MODEL-02', 'UI-MODEL-04']);
    expect(routesForConsole('OPS', ['DATA_STATUS_READ'], PRODUCTION_RELEASED_ROUTE_IDS).map(({ id }) => id)).toEqual(['UI-OPS-05']);
    expect(routesForConsole('SYSTEM', ['QNA_READ'], PRODUCTION_RELEASED_ROUTE_IDS).map(({ id }) => id)).toEqual(['UI-SYS-01']);
    expect(visibleConsoles(['QNA_READ'], PRODUCTION_RELEASED_ROUTE_IDS)).toEqual(['SYSTEM']);
    expect(visibleConsoles(['ACCESS_READ'], PRODUCTION_RELEASED_ROUTE_IDS)).toEqual(['SYSTEM']);
    expect(defaultRoute(readyAccess(['MODEL_ENGINEER'], ['MODEL_METRICS_READ'], 'MODEL'), PRODUCTION_RELEASED_ROUTE_IDS)).toMatchObject({ id: 'UI-MODEL-01' });
    expect(routesForConsole('MODEL', ['MODEL_METRICS_READ', 'MODEL_DIAGNOSTICS_READ']).map(({ id }) => id)).not.toContain('UI-MODEL-03');
    expect(resolvePreviewRoute('/admin-v2-preview/models/performance', { permissions: ['MODEL_METRICS_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-MODEL-02' } });
    expect(resolvePreviewRoute('/admin-v2-preview/system/support', { permissions: ['QNA_READ'] })).toMatchObject({ type: 'ALLOW', route: { id: 'UI-SYS-01' } });
  });
});

describe('admin v2 accessible primitives', () => {
  test('console switcher is route navigation, not an incomplete tabs pattern', async () => {
    const onSelect = jest.fn();
    render(<AdminConsoleSwitcher consoles={['OPS', 'MODEL']} activeConsole="OPS" onSelect={onSelect} />);
    const ops = screen.getByRole('button', { name: '운영' });
    expect(ops).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    ops.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('OPS');
  });

  test('table cells do not become tab stops and selectable rows use one explicit stable-key button', () => {
    const rows = [{ id: 'route-a', label: 'A', value: '1' }];
    const onSelect = jest.fn();
    const { rerender } = render(<AccessibleTable caption="일반 표" columns={['이름', '값']} rows={rows.map(({ label, value }) => [label, value])} rowKey={() => 'route-a'} />);
    screen.getAllByRole('cell').forEach((cell) => expect(cell).not.toHaveAttribute('tabindex'));
    rerender(<AccessibleTable caption="선택 표" columns={['이름', '값']} rows={rows.map(({ label, value }) => [label, value])} rowKey={() => 'route-a'} selectedKey="route-a" onSelect={onSelect} />);
    const action = screen.getByRole('button', { name: 'A' });
    expect(action).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledWith('route-a');
  });

  test('drawer supports initial focus, focus trap, Escape close, and trigger restoration', () => {
    function DrawerHarness() {
      const [open, setOpen] = useState(false);
      return <><main className="admin-v2-shell"><button type="button" onClick={() => setOpen(true)}>상세 열기</button></main><DetailDrawer open={open} title="상세" onClose={() => setOpen(false)}><button type="button">첫 동작</button></DetailDrawer></>;
    }
    render(<DrawerHarness />);
    const trigger = screen.getByRole('button', { name: '상세 열기' });
    trigger.focus();
    fireEvent.click(trigger);
    const drawer = screen.getByRole('dialog', { name: '상세' });
    const close = screen.getByRole('button', { name: '상세 닫기' });
    expect(drawer).toHaveFocus();
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.admin-v2-drawer-backdrop')).toBeInTheDocument();
    expect(document.querySelector('.admin-v2-shell')).toHaveAttribute('inert');
    fireEvent.keyDown(drawer, { key: 'Tab' });
    const action = screen.getByRole('button', { name: '첫 동작' });
    expect(action).toHaveFocus();
    fireEvent.keyDown(action, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  test('contextual drawer keeps desktop background interaction available', () => {
    const onBackgroundAction = jest.fn();
    function DrawerHarness() {
      const [open, setOpen] = useState(false);
      return <><main className="admin-v2-shell"><button type="button" onClick={onBackgroundAction}>배경 동작</button><button type="button" onClick={() => setOpen(true)}>상세 열기</button></main><DetailDrawer variant="contextual" open={open} title="상세" onClose={() => setOpen(false)}><button type="button">첫 동작</button></DetailDrawer></>;
    }
    render(<DrawerHarness />);
    const trigger = screen.getByRole('button', { name: '상세 열기' });
    trigger.focus();
    fireEvent.click(trigger);
    const drawer = screen.getByRole('dialog', { name: '상세' });
    expect(drawer).toHaveClass('admin-v2-drawer--contextual');
    expect(drawer).not.toHaveAttribute('aria-modal');
    expect(document.querySelector('.admin-v2-drawer-backdrop')).not.toBeInTheDocument();
    expect(document.querySelector('.admin-v2-shell')).not.toHaveAttribute('inert');
    expect(fireEvent.keyDown(drawer, { key: 'Tab' })).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '배경 동작' }));
    expect(onBackgroundAction).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  test('contextual drawer restores modal behavior on a narrow viewport', () => {
    mockMatchMedia(true);
    function DrawerHarness() {
      const [open, setOpen] = useState(false);
      return <><main className="admin-v2-shell"><button type="button" onClick={() => setOpen(true)}>상세 열기</button></main><DetailDrawer variant="contextual" open={open} title="상세" onClose={() => setOpen(false)}><button type="button">첫 동작</button></DetailDrawer></>;
    }
    render(<DrawerHarness />);
    const trigger = screen.getByRole('button', { name: '상세 열기' });
    trigger.focus();
    fireEvent.click(trigger);
    const drawer = screen.getByRole('dialog', { name: '상세' });
    expect(drawer).toHaveClass('admin-v2-drawer--modal');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.admin-v2-drawer-backdrop')).toBeInTheDocument();
    expect(document.querySelector('.admin-v2-shell')).toHaveAttribute('inert');
    fireEvent.keyDown(drawer, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '첫 동작' })).toHaveFocus();
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  test('contextual drawer changes modal semantics with the viewport while open', async () => {
    const media = mockMatchMedia(false);
    function DrawerHarness() {
      const [open, setOpen] = useState(true);
      return <><main className="admin-v2-shell"><button type="button" onClick={() => setOpen(false)}>배경 동작</button></main><DetailDrawer variant="contextual" open={open} title="상세" onClose={() => setOpen(false)}><button type="button">첫 동작</button></DetailDrawer></>;
    }
    render(<DrawerHarness />);
    const drawer = screen.getByRole('dialog', { name: '상세' });
    expect(drawer).not.toHaveAttribute('aria-modal');
    act(() => media.change(true));
    await waitFor(() => expect(drawer).toHaveAttribute('aria-modal', 'true'));
    expect(document.querySelector('.admin-v2-drawer-backdrop')).toBeInTheDocument();
    expect(document.querySelector('.admin-v2-shell')).toHaveAttribute('inert');
    act(() => media.change(false));
    await waitFor(() => expect(drawer).not.toHaveAttribute('aria-modal'));
    expect(document.querySelector('.admin-v2-drawer-backdrop')).not.toBeInTheDocument();
    expect(document.querySelector('.admin-v2-shell')).not.toHaveAttribute('inert');
  });

  test('dialog has unique labelled names and supports the same focus contract', () => {
    function DialogHarness() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>사유 열기</button><ReasonDialog open={open} title="사유 확인" onClose={() => setOpen(false)}><button type="button">사유 동작</button></ReasonDialog></>;
    }
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: '사유 열기' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '사유 확인' });
    const close = screen.getByRole('button', { name: '닫기' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '사유 동작' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: '사유 동작' }), { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });
});
