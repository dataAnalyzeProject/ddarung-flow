import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminV2ProductionApp from './AdminV2ProductionApp';

jest.mock('../operations/overview/index.jsx', () => () => <h1>LIVE OPS</h1>);
jest.mock('../operations/risk-map/index.jsx', () => () => <h1>LIVE RISK MAP</h1>);
jest.mock('../operations/candidates/index.jsx', () => () => <main className="candidates-page"><h1>LIVE CANDIDATES</h1></main>);
jest.mock('../model/overview/index.jsx', () => () => <h1>LIVE MODEL OVERVIEW</h1>);
jest.mock('../system/access/index.jsx', () => () => <h1>LIVE SYSTEM ACCESS</h1>);
jest.mock('../system/audit/index.jsx', () => () => <h1>LIVE SYSTEM AUDIT</h1>);

const allPermissions = [
  'OPS_DASHBOARD_READ', 'OPS_RISK_MAP_READ', 'OPS_CANDIDATE_READ', 'OPS_ANALYSIS_READ', 'MODEL_METRICS_READ', 'MODEL_RELEASE_READ', 'ACCESS_READ', 'AUDIT_READ', 'QNA_READ',
];

function readyAccess(permissions = ['OPS_DASHBOARD_READ', 'OPS_RISK_MAP_READ']) {
  return { state: 'READY', adminRoles: ['SUPER_ADMIN'], permissions, defaultConsole: 'OPS', generatedAt: '2026-08-30T00:00:00Z', source: 'LIVE' };
}

function adapterFor(access) {
  return () => ({ load: () => Promise.resolve(access) });
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('AdminV2ProductionApp', () => {
  test('starts in LOADING and then renders the released OPS overview', async () => {
    let resolve;
    const createAccessAdapter = () => ({ load: () => new Promise((done) => { resolve = done; }) });
    render(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={createAccessAdapter} />);

    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeDefined());
    await act(async () => resolve(readyAccess()));
    expect(screen.getByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
  });

  test('renders live reference time without fixture, preview, or development markers', async () => {
    const { container } = render(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={adapterFor(readyAccess())} />);

    expect(await screen.findByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
    expect(screen.getByText('기준 시각: 2026-08-30T00:00:00Z')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/fixture|preview|dev/i);
  });

  test('renders the released risk map and preserves query during canonical navigation', async () => {
    window.history.replaceState({}, '', '/admin/ops?fixture=SUPER_ADMIN&mode=review');
    render(<AdminV2ProductionApp createAccessAdapter={adapterFor(readyAccess(allPermissions))} />);

    expect(await screen.findByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수급 위험 지도' }));
    expect(window.location.pathname).toBe('/admin/ops/risk-map');
    expect(window.location.search).toBe('?fixture=SUPER_ADMIN&mode=review');
    expect(screen.getByRole('heading', { name: 'LIVE RISK MAP' })).toBeInTheDocument();
  });

  test.each([
    [{ state: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED', adminRoles: [], permissions: [], defaultConsole: null }, 'AUTH_REQUIRED'],
    [{ state: 'ADMIN_ACCESS_DENIED', code: 'ADMIN_ACCESS_DENIED', adminRoles: [], permissions: [], defaultConsole: null }, 'ADMIN_ACCESS_DENIED'],
    [{ state: 'ACCESS_ERROR', code: 'ADMIN_ACCESS_UNAVAILABLE', adminRoles: [], permissions: [], defaultConsole: null }, 'ADMIN_ACCESS_UNAVAILABLE'],
  ])('keeps %s access failures outside the shell', async (access, code) => {
    render(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={adapterFor(access)} />);

    expect(await screen.findByText(code)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '관리자 메뉴' })).not.toBeInTheDocument();
  });

  test('retry clears stale content and reloads access', async () => {
    let calls = 0;
    const createAccessAdapter = () => ({ load: () => {
      calls += 1;
      return calls === 1 ? Promise.resolve({ state: 'ACCESS_ERROR', code: 'ADMIN_ACCESS_UNAVAILABLE', adminRoles: [], permissions: [], defaultConsole: null }) : Promise.resolve(readyAccess());
    } });
    render(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={createAccessAdapter} />);

    expect(await screen.findByText('ADMIN_ACCESS_UNAVAILABLE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  test('ignores a stale previous access response and aborts on unmount', async () => {
    let resolveFirst;
    let firstSignal;
    const firstAdapter = () => ({ load: ({ signal }) => new Promise((resolve) => { firstSignal = signal; resolveFirst = resolve; }) });
    const secondAdapter = () => ({ load: () => Promise.resolve(readyAccess()) });
    const { rerender, unmount } = render(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={firstAdapter} />);
    await waitFor(() => expect(resolveFirst).toBeDefined());
    rerender(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={secondAdapter} />);
    expect(await screen.findByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
    await act(async () => resolveFirst(readyAccess(['OPS_RISK_MAP_READ'])));
    expect(screen.getByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
    unmount();
    expect(firstSignal.aborted).toBe(true);
  });

  test('renders the released candidates route and isolates unknown routes before domain rendering', async () => {
    const { rerender } = render(<AdminV2ProductionApp pathname="/admin/ops/candidates" createAccessAdapter={adapterFor(readyAccess(allPermissions))} />);
    expect(await screen.findByRole('heading', { name: 'LIVE CANDIDATES' })).toBeInTheDocument();
    rerender(<AdminV2ProductionApp pathname="/admin/not-real" createAccessAdapter={adapterFor(readyAccess(allPermissions))} />);
    expect(await screen.findByText('NOT_FOUND')).toBeInTheDocument();
  });

  test('does not add a nested main landmark around a page-owned main', async () => {
    const { container } = render(<AdminV2ProductionApp pathname="/admin/ops/candidates" createAccessAdapter={adapterFor(readyAccess(allPermissions))} />);

    expect(await screen.findByRole('heading', { name: 'LIVE CANDIDATES' })).toBeInTheDocument();
    expect(container.querySelector('.admin-v2-content').tagName).toBe('DIV');
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  test('shows every console with a released permitted route and no unreleased OPS item', async () => {
    render(<AdminV2ProductionApp pathname="/admin/ops" createAccessAdapter={adapterFor(readyAccess(allPermissions))} />);

    expect(await screen.findByRole('button', { name: '운영 상황판' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수급 위험 지도' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '집중관리 목록' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '반복 품절 패턴' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모델' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '시스템' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '데이터 상태' })).not.toBeInTheDocument();
  });

  test('keeps an unreleased sibling hidden when it shares MODEL_METRICS_READ', async () => {
    render(<AdminV2ProductionApp pathname="/admin/models" createAccessAdapter={adapterFor(readyAccess(['MODEL_METRICS_READ', 'MODEL_RELEASE_READ'], 'MODEL'))} />);

    expect(await screen.findByRole('heading', { name: 'LIVE MODEL OVERVIEW' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모델 운영 현황' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '성능·신뢰도' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '배포·복원' })).not.toBeInTheDocument();
  });

  test.each([
    ['/admin/system/access', 'ACCESS_READ', 'LIVE SYSTEM ACCESS', '관리자 역할·권한'],
    ['/admin/system/audit', 'AUDIT_READ', 'LIVE SYSTEM AUDIT', '관리자 변경 이력'],
  ])('shows released system navigation only with its permission', async (pathname, permission, heading, title) => {
    render(<AdminV2ProductionApp pathname={pathname} createAccessAdapter={adapterFor(readyAccess([permission], 'SYSTEM'))} />);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '문의 관리' })).not.toBeInTheDocument();
  });

  test('rejects a released system route without its permission', async () => {
    render(<AdminV2ProductionApp pathname="/admin/system/access" createAccessAdapter={adapterFor(readyAccess(['AUDIT_READ'], 'SYSTEM'))} />);

    expect(await screen.findByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: ACCESS_READ')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LIVE SYSTEM ACCESS' })).not.toBeInTheDocument();
  });

  test('keeps direct navigation to an unreleased shared-permission route unavailable', async () => {
    render(<AdminV2ProductionApp pathname="/admin/models/performance" createAccessAdapter={adapterFor(readyAccess(['MODEL_METRICS_READ'], 'MODEL'))} />);

    expect(await screen.findByText('RELEASE_NOT_AVAILABLE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LIVE MODEL OVERVIEW' })).not.toBeInTheDocument();
  });

  test('keeps a browser refresh on an unreleased shared-permission route unavailable', async () => {
    window.history.replaceState({}, '', '/admin/models/performance?mode=review');
    render(<AdminV2ProductionApp createAccessAdapter={adapterFor(readyAccess(['MODEL_METRICS_READ'], 'MODEL'))} />);

    expect(await screen.findByText('RELEASE_NOT_AVAILABLE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LIVE MODEL OVERVIEW' })).not.toBeInTheDocument();
  });

  test('popstate re-applies the release gate to an unreleased shared-permission route', async () => {
    window.history.replaceState({}, '', '/admin/models?mode=review');
    render(<AdminV2ProductionApp createAccessAdapter={adapterFor(readyAccess(['MODEL_METRICS_READ'], 'MODEL'))} />);

    expect(await screen.findByRole('heading', { name: 'LIVE MODEL OVERVIEW' })).toBeInTheDocument();
    window.history.pushState({}, '', '/admin/models/performance?mode=review');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(await screen.findByText('RELEASE_NOT_AVAILABLE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LIVE MODEL OVERVIEW' })).not.toBeInTheDocument();
  });

  test('fixture query does not bypass live route authorization and popstate re-evaluates routes', async () => {
    window.history.replaceState({}, '', '/admin/ops?fixture=SUPER_ADMIN');
    render(<AdminV2ProductionApp createAccessAdapter={adapterFor(readyAccess(['OPS_DASHBOARD_READ']))} />);

    expect(await screen.findByRole('heading', { name: 'LIVE OPS' })).toBeInTheDocument();
    window.history.pushState({}, '', '/admin/ops/risk-map?fixture=SUPER_ADMIN');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(await screen.findByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: OPS_RISK_MAP_READ')).toBeInTheDocument();
  });
});
