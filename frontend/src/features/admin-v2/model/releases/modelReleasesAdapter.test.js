import { availableActions, createLiveModelReleasesAdapter } from './modelReleasesAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }
const batches = { batches: [{ batchId: 'b1', modelVersion: 'batch-v1', publishStatus: 'ACTIVE', featureAsOf: '2026-08-31T00:00:00Z', expiresAt: '2026-08-31T01:00:00Z', coverageRatio: 1 }] };

describe('modelReleasesAdapter', () => {
  afterEach(() => { global.fetch = undefined; });
  test('loads prediction batches and optional registry/history sources independently', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ', 'AUDIT_READ'] }))
      .mockResolvedValueOnce(response(batches)).mockResolvedValueOnce(response([{ id: 7, version: 'safe-v1', state: 'APPROVED', createdAt: '2026-08-31T00:00:00Z' }]));
    const result = await createLiveModelReleasesAdapter().load({});
    expect(result.batches.data).toEqual(batches); expect(result.registry.data).toHaveLength(1); expect(result.history).toEqual({ state: 'UNAVAILABLE', code: 'MODEL_LIFECYCLE_AUDIT_SCOPE_UNAVAILABLE' });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/prediction-batches', expect.objectContaining({ credentials: 'include' }));
  });
  test('marks missing optional permissions as access-limited without treating them as empty', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ'] })).mockResolvedValueOnce(response(batches));
    const result = await createLiveModelReleasesAdapter().load({});
    expect(result.registry).toEqual({ state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' }); expect(result.history).toEqual({ state: 'ACCESS_LIMITED', permission: 'AUDIT_READ' }); expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_ACCESS_DENIED'], [403, 'ADMIN_PERMISSION_DENIED']])('preserves %s %s from a source', async (status, code) => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ'] })).mockResolvedValueOnce(response({ code }, status));
    const result = await createLiveModelReleasesAdapter().load({});
    expect(result.batches).toEqual(expect.objectContaining({ state: 'FORBIDDEN', error: expect.objectContaining({ status, code }) }));
  });
  test('uses real permission and lifecycle combinations for actions', () => {
    expect(availableActions({ state: 'DRAFT' }, ['MODEL_ARTIFACT_REGISTER', 'MODEL_VALIDATE'])).toEqual(['REGISTER', 'VALIDATE']);
    expect(availableActions({ state: 'VALIDATED' }, ['MODEL_APPROVE'])).toEqual(['APPROVE', 'REJECT']);
    expect(availableActions({ state: 'APPROVED' }, ['MODEL_ACTIVATE'])).toEqual(['ACTIVATE']);
    expect(availableActions({ state: 'ACTIVE' }, ['MODEL_ROLLBACK'])).toEqual(['ROLLBACK']);
  });
  test('reports malformed 200 sources as errors rather than empty', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] })).mockResolvedValueOnce(response({ batches: {} })).mockResolvedValueOnce(response([{ id: 1, version: 'safe-v1', state: 'DRAFT' }]));
    const result = await createLiveModelReleasesAdapter().load({}); expect(result.batches).toEqual(expect.objectContaining({ state: 'ERROR', error: expect.objectContaining({ code: 'PREDICTION_BATCH_RESPONSE_INVALID' }) })); expect(result.registry).toEqual(expect.objectContaining({ state: 'ERROR', error: expect.objectContaining({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' }) }));
  });
  test('rejects a registry row without its source request key', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] })).mockResolvedValueOnce(response(batches)).mockResolvedValueOnce(response([{ version: 'safe-v1', state: 'DRAFT', createdAt: '2026-08-31T00:00:00Z' }]));
    const result = await createLiveModelReleasesAdapter().load({}); expect(result.registry).toEqual(expect.objectContaining({ state: 'ERROR', error: expect.objectContaining({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' }) }));
  });
  test.each([['VALIDATE', 1, '/api/v1/admin/models/1/validate'], ['APPROVE', 1, '/api/v1/admin/models/1/approve'], ['REJECT', 1, '/api/v1/admin/models/1/reject'], ['ACTIVATE', 1, '/api/v1/admin/models/1/activate'], ['ROLLBACK', undefined, '/api/v1/admin/models/rollback']])('uses source-defined %s endpoint without expectedVersion', async (type, id, path) => {
    global.fetch = jest.fn().mockResolvedValue(response({})); await createLiveModelReleasesAdapter().action({ type, id });
    expect(global.fetch).toHaveBeenCalledWith(`http://localhost:8080${path}`, expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(global.fetch.mock.calls[0][1].body).toBeUndefined();
  });
});
