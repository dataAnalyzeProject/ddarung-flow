import { availableActions, createLiveModelReleasesAdapter } from './modelReleasesAdapter';
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }
const runtime = { status: 'NORMAL', modelVersion: 'runtime-v1', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] };
describe('modelReleasesAdapter', () => {
  afterEach(() => { global.fetch = undefined; });
  test('loads base access then runtime and registry sources with no batch request', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] })).mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response([{ id: 7, version: 'safe-v1', state: 'APPROVED', createdAt: '2026-08-31T00:00:00Z' }]));
    const result = await createLiveModelReleasesAdapter().load({}); expect(result.runtime.data).toEqual(runtime); expect(result.registry.data).toHaveLength(1); expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('prediction-batches'), expect.anything());
  });
  test('keeps release base available with no metrics permission', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ'] })); const result = await createLiveModelReleasesAdapter().load({}); expect(result.runtime).toEqual({ state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' }); expect(result.registry).toEqual({ state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' });
  });
  test('preserves runtime failure independently of registry success', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] })).mockResolvedValueOnce(response({ code: 'MODEL_RUNTIME_UNAVAILABLE' }, 503)).mockResolvedValueOnce(response([])); const result = await createLiveModelReleasesAdapter().load({}); expect(result.runtime).toEqual(expect.objectContaining({ state: 'ERROR' })); expect(result.registry).toEqual({ state: 'SUCCESS', data: [] });
  });
  test('uses source-defined actions with CSRF', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'test-csrf-token' })).mockResolvedValueOnce(response({})); await createLiveModelReleasesAdapter().action({ type: 'VALIDATE', id: 1 }); expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/admin/models/1/validate', expect.objectContaining({ method: 'POST', headers: { 'X-CSRF-TOKEN': 'test-csrf-token' } }));
  });
  test('uses real lifecycle permissions', () => { expect(availableActions({ state: 'DRAFT' }, ['MODEL_ARTIFACT_REGISTER', 'MODEL_VALIDATE'])).toEqual(['REGISTER', 'VALIDATE']); expect(availableActions({ state: 'APPROVED' }, ['MODEL_ACTIVATE'])).toEqual(['ACTIVATE']); });
});
