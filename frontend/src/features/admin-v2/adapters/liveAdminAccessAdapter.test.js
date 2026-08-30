import { createLiveAdminAccessAdapter } from './liveAdminAccessAdapter';

const readyPayload = {
  role: 'ADMIN',
  accountRole: 'ADMIN',
  adminRoles: ['OPS_VIEWER'],
  permissions: ['OPS_DASHBOARD_READ'],
  defaultConsole: 'OPS',
  generatedAt: '2026-08-30T00:00:00Z',
};

function response(status, body = readyPayload) {
  return { status, ok: status >= 200 && status < 300, json: jest.fn().mockResolvedValue(body) };
}

describe('live admin access adapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.REACT_APP_API_BASE_URL;
  });

  test('uses the live access URL, credentials, and supplied AbortSignal', async () => {
    process.env.REACT_APP_API_BASE_URL = 'https://api.example.test';
    global.fetch = jest.fn().mockResolvedValue(response(200));
    const controller = new AbortController();

    const access = await createLiveAdminAccessAdapter().load({ signal: controller.signal });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/v1/admin/access', {
      method: 'GET', credentials: 'include', signal: controller.signal,
    });
    expect(access).toEqual({ state: 'READY', ...readyPayload, source: 'LIVE' });
  });

  test.each([
    [401, 'AUTH_REQUIRED', 'AUTH_REQUIRED'],
    [403, 'ADMIN_ACCESS_DENIED', 'ADMIN_ACCESS_DENIED'],
    [500, 'ACCESS_ERROR', 'ADMIN_ACCESS_UNAVAILABLE'],
  ])('maps %s to the safe access state', async (status, state, code) => {
    global.fetch = jest.fn().mockResolvedValue(response(status));

    const access = await createLiveAdminAccessAdapter().load();

    expect(access).toMatchObject({ state, code, adminRoles: [], permissions: [], defaultConsole: null, generatedAt: null, source: 'LIVE' });
  });

  test.each([
    ['network rejection', () => Promise.reject(new Error('network unavailable'))],
    ['invalid 200 payload', () => Promise.resolve(response(200, { adminRoles: 'invalid', permissions: [] }))],
  ])('%s becomes ACCESS_ERROR without inferred access', async (_label, fetchResult) => {
    global.fetch = jest.fn(fetchResult);

    const access = await createLiveAdminAccessAdapter().load();

    expect(access).toMatchObject({ state: 'ACCESS_ERROR', code: 'ADMIN_ACCESS_UNAVAILABLE', adminRoles: [], permissions: [] });
  });

  test('preserves AbortError semantics', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abort);

    await expect(createLiveAdminAccessAdapter().load()).rejects.toBe(abort);
  });
});
