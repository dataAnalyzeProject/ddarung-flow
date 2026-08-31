import { createLiveModelOverviewAdapter, deriveRegistryStateCounts } from './modelOverviewAdapter';

function jsonResponse(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }

describe('modelOverviewAdapter', () => {
  afterEach(() => { global.fetch = undefined; });

  test('loads the registry list with credentials and derives only approved summary states', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse([
      { id: 1, version: 'public-v1', state: 'DRAFT', createdAt: '2026-08-31T00:00:00Z' },
      { id: 2, version: 'public-v2', state: 'ACTIVE', createdAt: '2026-08-31T00:00:00Z' },
      { id: 3, version: 'public-v3', state: 'REJECTED', createdAt: '2026-08-31T00:00:00Z' },
    ]));
    const result = await createLiveModelOverviewAdapter().load({ signal: undefined });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/models', expect.objectContaining({ credentials: 'include' }));
    expect(result.registryStateCounts).toEqual({ DRAFT: 1, VALIDATED: 0, APPROVED: 0, ACTIVE: 1, RETIRED: 0 });
  });

  test('keeps all summary states at zero for an empty source list', () => {
    expect(deriveRegistryStateCounts([])).toEqual({ DRAFT: 0, VALIDATED: 0, APPROVED: 0, ACTIVE: 0, RETIRED: 0 });
  });

  test('normalizes a permission failure without inventing registry counts', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ code: 'ADMIN_PERMISSION_DENIED', message: 'denied' }, 403));
    await expect(createLiveModelOverviewAdapter().load({ signal: undefined })).rejects.toMatchObject({ status: 403, code: 'ADMIN_PERMISSION_DENIED' });
  });

  test('rejects a non-list success body instead of treating it as an empty registry', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ items: [] }));
    await expect(createLiveModelOverviewAdapter().load({ signal: undefined })).rejects.toMatchObject({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' });
  });
});
