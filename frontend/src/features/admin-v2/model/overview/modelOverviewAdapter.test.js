import { createLiveModelOverviewAdapter, deriveRegistryStateCounts } from './modelOverviewAdapter';
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }
const runtime = { status: 'NORMAL', modelVersion: 'runtime-v1', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] };
describe('modelOverviewAdapter', () => {
  afterEach(() => { global.fetch = undefined; });
  test('loads runtime and registry independently with credentials', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response([{ id: 1, state: 'ACTIVE' }]));
    const result = await createLiveModelOverviewAdapter().load({});
    expect(result.runtime.data).toEqual(runtime); expect(result.registryStateCounts).toEqual({ DRAFT: 0, VALIDATED: 0, APPROVED: 0, ACTIVE: 1, RETIRED: 0 });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/model-runtime', expect.objectContaining({ credentials: 'include' })); expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/models', expect.objectContaining({ credentials: 'include' }));
  });
  test('retains a successful registry when runtime readback fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ code: 'MODEL_RUNTIME_UNAVAILABLE' }, 503)).mockResolvedValueOnce(response([]));
    const result = await createLiveModelOverviewAdapter().load({}); expect(result.runtime).toEqual(expect.objectContaining({ state: 'ERROR' })); expect(result.registry).toEqual({ state: 'SUCCESS', data: [] });
  });
  test('rejects malformed runtime rather than inventing a version', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ status: 'NORMAL' })).mockResolvedValueOnce(response([]));
    const result = await createLiveModelOverviewAdapter().load({}); expect(result.runtime.error.code).toBe('MODEL_RUNTIME_RESPONSE_INVALID');
  });
  test('keeps malformed registry success distinct from an empty registry', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response({ items: [] }));
    const result = await createLiveModelOverviewAdapter().load({});
    expect(result.registry).toEqual(expect.objectContaining({ state: 'ERROR', error: expect.objectContaining({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' }) }));
    expect(result.registryStateCounts).toBeNull();
  });
  test('derives lifecycle counts only from source rows', () => { expect(deriveRegistryStateCounts([{ state: 'DRAFT' }, { state: 'REJECTED' }])).toEqual({ DRAFT: 1, VALIDATED: 0, APPROVED: 0, ACTIVE: 0, RETIRED: 0 }); });
});
