import { createLiveModelOverviewAdapter, deriveRegistryStateCounts } from './modelOverviewAdapter';
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }
const runtime = { status: 'NORMAL', modelVersion: 'runtime-v1', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] };
describe('modelOverviewAdapter', () => {
  afterEach(() => { global.fetch = undefined; });
  test('loads runtime and registry independently with credentials', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response([{ id: 1, version: 'runtime-v1', state: 'ACTIVE', createdAt: '2026-09-01T00:00:00Z', artifactSha256: 'a'.repeat(64), codeCommit: 'abc123', featureSchemaVersion: 'v1' }]));
    const result = await createLiveModelOverviewAdapter().load({});
    expect(result.runtime.data).toEqual(runtime); expect(result.registryStateCounts).toEqual({ DRAFT: 0, VALIDATED: 0, APPROVED: 0, REJECTED: 0, ACTIVE: 1, RETIRED: 0 });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/model-runtime', expect.objectContaining({ credentials: 'include' })); expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/models', expect.objectContaining({ credentials: 'include' }));
  });
  test('accepts runtime-imported registry provenance as explicitly unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response([{ id: 2, version: 'runtime-v1', state: 'ACTIVE', createdAt: '2026-09-01T00:00:00Z', artifactSha256: 'a'.repeat(64), codeCommit: null, featureSchemaVersion: null }]));
    const result = await createLiveModelOverviewAdapter().load({});
    expect(result.registry).toEqual(expect.objectContaining({ state: 'SUCCESS' }));
    expect(result.registryStateCounts.ACTIVE).toBe(1);
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
  test('derives every backend lifecycle state including rejected', () => { expect(deriveRegistryStateCounts([{ state: 'DRAFT' }, { state: 'REJECTED' }])).toEqual({ DRAFT: 1, VALIDATED: 0, APPROVED: 0, REJECTED: 1, ACTIVE: 0, RETIRED: 0 }); });

  test.each([
    [[{ version: 'missing-id', state: 'DRAFT', createdAt: '2026-09-01T00:00:00Z' }]],
    [[{ id: 1, version: 'bad-state', state: 'UNKNOWN', createdAt: '2026-09-01T00:00:00Z' }]],
  ])('rejects malformed registry rows instead of treating them as lifecycle data', async (models) => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response(models));
    const result = await createLiveModelOverviewAdapter().load({});
    expect(result.registry).toEqual(expect.objectContaining({ state: 'ERROR', error: expect.objectContaining({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' }) }));
  });
});
