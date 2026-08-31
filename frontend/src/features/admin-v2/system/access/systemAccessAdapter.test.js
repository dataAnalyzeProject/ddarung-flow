import { createLiveSystemAccessAdapter, SystemAccessApiError } from './systemAccessAdapter';

const opaqueId = '22222222-2222-4222-8222-222222222222';

describe('live system access adapter', () => {
  afterEach(() => jest.restoreAllMocks());

  test('uses authenticated source endpoints and maps list query parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await createLiveSystemAccessAdapter().loadPage({ page: 2, size: 20, sort: 'displayName,asc', q: '가', signal: 'signal' });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/access'), expect.objectContaining({ credentials: 'include', signal: 'signal' }));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/users?page=2&size=20&sort=displayName%2Casc&q=%EA%B0%80'), expect.objectContaining({ credentials: 'include' }));
  });

  test('sends only desired-set PUT payload and preserves source errors', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', token: 'csrf-token' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ version: 8 }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({ code: 'ROLE_ASSIGNMENT_VERSION_CONFLICT' }) });
    const adapter = createLiveSystemAccessAdapter();
    await adapter.replaceRoles(opaqueId, { expectedVersion: 7, assignments: [], reason: '정리' });
    expect(global.fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/api/v1/auth/csrf'), expect.objectContaining({ credentials: 'include' }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringContaining(`/api/v1/admin/users/${opaqueId}/roles`), expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'csrf-token' }), body: JSON.stringify({ expectedVersion: 7, assignments: [], reason: '정리' }) }));
    await expect(adapter.loadUser(opaqueId)).rejects.toEqual(expect.objectContaining({ name: 'SystemAccessApiError', code: 'ROLE_ASSIGNMENT_VERSION_CONFLICT', status: 409 }));
    expect(SystemAccessApiError).toBeDefined();
  });

  test('does not invent a 403 error code when the source response has no code', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
    await expect(createLiveSystemAccessAdapter().loadUser(opaqueId)).rejects.toEqual(expect.objectContaining({ status: 403, code: null }));
  });
});
