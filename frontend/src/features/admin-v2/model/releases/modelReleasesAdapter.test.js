import { availableActions, createLiveModelReleasesAdapter, sha256File } from './modelReleasesAdapter';
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }
const runtime = { status: 'NORMAL', modelVersion: 'runtime-v1', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] };
const model = { id: 7, version: 'runtime-v1', state: 'APPROVED', createdAt: '2026-08-31T00:00:00Z', artifactSha256: 'a'.repeat(64), codeCommit: 'abc123', featureSchemaVersion: 'v1' };
const history = [{ action: 'MODEL_APPROVE', resourceType: 'MODEL', resourceVersion: 'runtime-v1', result: 'SUCCESS', reasonCode: null, occurredAt: '2026-09-01T00:00:00Z' }];
const originalCrypto = globalThis.crypto;

describe('modelReleasesAdapter', () => {
  afterEach(() => { global.fetch = undefined; Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto }); jest.restoreAllMocks(); });

  test('loads access, runtime, registry, and safe model history independently', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] })).mockResolvedValueOnce(response(runtime)).mockResolvedValueOnce(response([model])).mockResolvedValueOnce(response(history));
    const result = await createLiveModelReleasesAdapter().load({});
    expect(result.runtime.data).toEqual(runtime); expect(result.registry.data).toEqual([model]); expect(result.history.data).toEqual(history);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/models/history', expect.objectContaining({ credentials: 'include' }));
  });

  test('keeps release history available with no metrics permission', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ'] })).mockResolvedValueOnce(response(history));
    const result = await createLiveModelReleasesAdapter().load({});
    expect(result.runtime).toEqual({ state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' });
    expect(result.registry).toEqual({ state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' });
    expect(result.history.data).toEqual(history);
  });

  test('preserves runtime failure independently of registry and history success', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] })).mockResolvedValueOnce(response({ code: 'MODEL_RUNTIME_UNAVAILABLE' }, 503)).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]));
    const result = await createLiveModelReleasesAdapter().load({});
    expect(result.runtime.state).toBe('ERROR'); expect(result.registry).toEqual({ state: 'SUCCESS', data: [] }); expect(result.history).toEqual({ state: 'SUCCESS', data: [] });
  });

  test.each([
    ['VALIDATE', 1, '/api/v1/admin/models/1/validate'], ['APPROVE', 1, '/api/v1/admin/models/1/approve'],
    ['REJECT', 1, '/api/v1/admin/models/1/reject'], ['ACTIVATE', 1, '/api/v1/admin/models/1/activate'],
    ['ROLLBACK', undefined, '/api/v1/admin/models/rollback'],
  ])('maps %s with CSRF and no action body', async (type, id, path) => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'test-csrf-token' })).mockResolvedValueOnce(response({}));
    await createLiveModelReleasesAdapter().action({ type, id });
    expect(global.fetch).toHaveBeenNthCalledWith(2, `http://localhost:8080${path}`, expect.objectContaining({ method: 'POST', headers: { 'X-CSRF-TOKEN': 'test-csrf-token' } }));
    expect(global.fetch.mock.calls[1][1].body).toBeUndefined();
  });

  test('hashes and uploads artifact then manifest before registration without private object keys', async () => {
    const digest = new Uint8Array(32).fill(1).buffer;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: jest.fn().mockResolvedValue(digest) } } });
    const files = [{ name: 'model.bin', size: 3, arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer) }, { name: 'manifest.json', size: 2, arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([4, 5]).buffer) }];
    let uploads = 0;
    global.fetch = jest.fn(async (url, options) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'csrf' });
      if (url.endsWith('/model-uploads') && options.method === 'POST') { uploads += 1; return response({ id: `upload-${uploads}` }, 201); }
      if (url.includes('/content')) return response({});
      if (url.includes('/complete')) return response({ status: 'COMPLETED' });
      if (url.endsWith('/models')) return response(model, 201);
      throw new Error(`unexpected ${url}`);
    });
    const metadata = { version: 'runtime-v1', codeCommit: 'abc123', dataManifestHash: 'd'.repeat(64), configHash: 'c'.repeat(64), featureSchemaVersion: 'v1' };
    await createLiveModelReleasesAdapter().register({ artifactFile: files[0], manifestFile: files[1], metadata });
    const createBodies = global.fetch.mock.calls.filter(([url]) => url.endsWith('/model-uploads')).map(([, options]) => JSON.parse(options.body));
    expect(createBodies.map(({ fileName }) => fileName)).toEqual(['model.bin', 'manifest.json']);
    const registerCall = global.fetch.mock.calls.find(([url, options]) => url.endsWith('/models') && options.method === 'POST');
    expect(JSON.parse(registerCall[1].body)).toEqual({ ...metadata, artifactUploadId: 'upload-1', manifestUploadId: 'upload-2' });
    expect(registerCall[1].body).not.toMatch(/objectKey|internal/);
    expect(await sha256File(files[0])).toBe('01'.repeat(32));
  });

  test.each([
    [runtime, 'VERIFIED'],
    [{ ...runtime, modelVersion: 'other' }, 'MISMATCH'],
    [null, 'UNAVAILABLE'],
  ])('classifies serving readback as %s', async (runtimeBody, expectedState) => {
    global.fetch = jest.fn(async (url) => {
      if (url.endsWith('/model-runtime')) return runtimeBody ? response(runtimeBody) : response({ code: 'MODEL_RUNTIME_UNAVAILABLE' }, 503);
      if (url.endsWith('/models')) return response([model]);
      if (url.endsWith('/models/history')) return response([]);
      throw new Error(`unexpected ${url}`);
    });
    const result = await createLiveModelReleasesAdapter({ readbackAttempts: 1, readbackDelayMs: 0 }).verifyServing({ candidateModelId: 7, permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'] });
    expect(result.state).toBe(expectedState);
  });

  test('uses real lifecycle permissions including register and rollback', () => {
    expect(availableActions({ state: 'DRAFT' }, ['MODEL_ARTIFACT_REGISTER', 'MODEL_VALIDATE'])).toEqual(['REGISTER', 'VALIDATE']);
    expect(availableActions({ state: 'VALIDATED' }, ['MODEL_APPROVE'])).toEqual(['APPROVE', 'REJECT']);
    expect(availableActions({ state: 'APPROVED' }, ['MODEL_ACTIVATE'])).toEqual(['ACTIVATE']);
    expect(availableActions({ state: 'ACTIVE' }, ['MODEL_ROLLBACK'])).toEqual(['ROLLBACK']);
  });
});
