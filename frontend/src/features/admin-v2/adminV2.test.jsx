import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminV2PreviewApp from './shell/AdminV2PreviewApp';
import AdminConsoleSwitcher from './components/AdminConsoleSwitcher';
import DetailDrawer from './components/DetailDrawer';
import ReasonDialog from './components/ReasonDialog';
import AsyncStatePanel from './components/AsyncStatePanel';
import { ASYNC_STATES } from './states/adminStates';
import { createFixtureAdminAccessAdapter } from './fixtures/fixtureAdminAccessAdapter';
import { defaultRoute, isAdminV2PreviewPath, resolvePreviewRoute, ROUTES, visibleConsoles } from './routes/routeMap';

async function renderPreview(pathname, fixture = 'OPS_VIEWER') {
  render(<AdminV2PreviewApp pathname={pathname} search={`?fixture=${fixture}`} />);
  await waitFor(() => expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument());
}

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

  test('shows permitted menus and hides unavailable menus', async () => {
    await renderPreview('/admin-v2-preview/ops', 'OPS_VIEWER');
    expect(screen.getByRole('button', { name: '위험 지도' })).toBeInTheDocument();
    expect(screen.getByText('FIXTURE / API_NOT_CONNECTED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '리포트' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '모델' })).not.toBeInTheDocument();
  });

  test('direct URL with no permission is forbidden and renders no domain fixture placeholder', async () => {
    await renderPreview('/admin-v2-preview/models/releases', 'OPS_VIEWER');
    expect(screen.getByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: MODEL_RELEASE_READ')).toBeInTheDocument();
    expect(screen.queryByText('UI-MODEL-04')).not.toBeInTheDocument();
    expect(screen.queryByText('FIXTURE / API_NOT_CONNECTED')).not.toBeInTheDocument();
  });

  test('root uses the default console and first permitted route', async () => {
    await renderPreview('/admin-v2-preview', 'MODEL_ENGINEER');
    expect(screen.getByText('UI-MODEL-01')).toBeInTheDocument();
    const access = { permissions: ['MODEL_METRICS_READ'], defaultConsole: 'OPS' };
    expect(defaultRoute(access).id).toBe('UI-MODEL-01');
  });

  test('unknown fixture is access error, not super admin', async () => {
    await renderPreview('/admin-v2-preview/ops', 'UNKNOWN');
    expect(screen.getByText('ADMIN_ACCESS_UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('UI-OPS-01')).not.toBeInTheDocument();
    const access = await createFixtureAdminAccessAdapter({ fixtureId: 'UNKNOWN' }).load();
    expect(access).toMatchObject({ state: 'ACCESS_ERROR', permissions: [] });
  });

  test.each(['AUTH_REQUIRED', 'ADMIN_ACCESS_DENIED', 'ACCESS_ERROR'])('%s has no nav or route data', async (fixtureId) => {
    await renderPreview('/admin-v2-preview/ops', fixtureId);
    expect(screen.queryByRole('navigation', { name: '관리자 메뉴' })).not.toBeInTheDocument();
    expect(screen.queryByText('UI-OPS-01')).not.toBeInTheDocument();
  });

  test.each(ASYNC_STATES)('renders the %s common state', (state) => {
    render(<AsyncStatePanel state={state} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  test('all nine common states have stable copy', () => {
    expect(ASYNC_STATES).toEqual(['LOADING', 'SUCCESS', 'EMPTY', 'PARTIAL', 'DELAYED', 'INSUFFICIENT_DATA', 'UNAVAILABLE', 'FORBIDDEN', 'ERROR']);
  });

  test('route metadata has canonical and preview mappings for every route', () => {
    expect(ROUTES).toHaveLength(16);
    expect(ROUTES.every((route) => route.canonicalPath.startsWith('/admin/') && route.previewPath.startsWith('/admin-v2-preview/') && route.requiredPermission)).toBe(true);
    expect(resolvePreviewRoute('/admin-v2-preview/not-a-route', { permissions: [] }).type).toBe('NOT_FOUND');
  });

  test('production disables the preview helper', () => {
    expect(isAdminV2PreviewPath('/admin-v2-preview/ops', 'production')).toBe(false);
    expect(isAdminV2PreviewPath('/admin-v2-preview/ops', 'test')).toBe(true);
  });

  test('fixture data has no sensitive identity fields', async () => {
    const samples = await Promise.all(['OPS_VIEWER', 'SUPER_ADMIN', 'AUTH_REQUIRED', 'UNKNOWN'].map((fixtureId) => createFixtureAdminAccessAdapter({ fixtureId }).load()));
    const fixtureText = JSON.stringify(samples).toLowerCase();
    ['email', 'oauth', 'provider', 'token', 'objectkey', 'binarypath', 'userId'.toLowerCase()].forEach((forbidden) => expect(fixtureText).not.toContain(forbidden));
  });
});

describe('admin v2 accessibility primitives', () => {
  test('console switcher supports keyboard focus and selection', () => {
    const onSelect = jest.fn();
    render(<AdminConsoleSwitcher consoles={['OPS', 'MODEL']} activeConsole="OPS" onSelect={onSelect} />);
    userEvent.tab();
    expect(screen.getByRole('tab', { name: '운영' })).toHaveFocus();
    userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('OPS');
  });

  test('drawer and dialog focus their close controls', () => {
    const onClose = jest.fn();
    const { rerender } = render(<DetailDrawer open title="상세" onClose={onClose} />);
    expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
    rerender(<ReasonDialog open title="사유" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: '사유' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
  });
});
