import { render, screen, waitFor } from '@testing-library/react';
import AppHeader from './AppHeader';

function response(status, payload = null) {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(payload) };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows the admin console entry only after live access confirms an admin-capable session', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response(200, {
    adminRoles: ['OPS_VIEWER'], permissions: ['OPS_DASHBOARD_READ'], defaultConsole: 'OPS',
  })));

  render(<AppHeader authState="authenticated" user={{ displayName: '관리자', provider: 'KAKAO' }} />);

  expect(screen.queryByRole('button', { name: '관리자 콘솔' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '관리자 콘솔' })).toBeInTheDocument();
});

test.each([401, 403, 500])('does not show the admin console entry for live access status %s', async (status) => {
  global.fetch = jest.fn(() => Promise.resolve(response(status)));

  render(<AppHeader authState="authenticated" user={{ displayName: '사용자', provider: 'KAKAO' }} />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '관리자 콘솔' })).not.toBeInTheDocument();
});
