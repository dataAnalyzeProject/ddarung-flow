import { createLiveModelPerformanceAdapter, ModelPerformanceApiError } from './modelPerformanceAdapter';

const base = {
  artifactSha256: 'a'.repeat(64), modelVersion: 'model-5.2', generatedAt: '2026-09-01T09:00:00Z',
  evaluation: { referenceHorizonMinutes: 120, referenceRequiredBikeCount: 3 }, combinations: [], calibrationBins: [],
};

function response(status, body) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }

describe('model performance adapter', () => {
  afterEach(() => jest.restoreAllMocks());

  test('uses credentialed, separated base and diagnostics endpoints', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(200, base)).mockResolvedValueOnce(response(200, { ...base, segments: [] }));
    const adapter = createLiveModelPerformanceAdapter();
    const loadedBase = await adapter.loadBase({});
    await adapter.loadDiagnostics(loadedBase, {});
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/admin/model-performance', { credentials: 'include', signal: undefined });
    expect(global.fetch).toHaveBeenNthCalledWith(2, `http://localhost:8080/api/v1/admin/model-performance/diagnostics?artifactSha256=${'a'.repeat(64)}`, { credentials: 'include', signal: undefined });
  });

  test('fails closed when the base response carries diagnostics segments', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, { ...base, segments: [{ axis: 'STATION' }] }));
    await expect(createLiveModelPerformanceAdapter().loadBase({})).rejects.toMatchObject({ code: 'MODEL_PERFORMANCE_RESPONSE_INVALID' });
  });

  test('rejects a diagnostics response from a different snapshot', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, { ...base, artifactSha256: 'b'.repeat(64), segments: [] }));
    await expect(createLiveModelPerformanceAdapter().loadDiagnostics(base, {})).rejects.toMatchObject({ code: 'DIAGNOSTICS_SNAPSHOT_MISMATCH' });
  });

  test('normalizes permission errors without treating them as empty diagnostics', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(403, { code: 'ADMIN_PERMISSION_DENIED' }));
    await expect(createLiveModelPerformanceAdapter().loadDiagnostics(base, {})).rejects.toBeInstanceOf(ModelPerformanceApiError);
    await expect(createLiveModelPerformanceAdapter().loadDiagnostics(base, {})).rejects.toMatchObject({ status: 403, code: 'ADMIN_PERMISSION_DENIED' });
  });

  test.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'ADMIN_PERMISSION_DENIED'],
    [404, 'MODEL_PERFORMANCE_NOT_FOUND'],
    [500, 'MODEL_PERFORMANCE_API_ERROR'],
  ])('preserves HTTP %i and its response code', async (status, code) => {
    global.fetch = jest.fn().mockResolvedValue(response(status, { code }));
    await expect(createLiveModelPerformanceAdapter().loadBase({})).rejects.toMatchObject({ status, code });
  });

  test('does not turn a transport failure into an HTTP error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network offline'));
    await expect(createLiveModelPerformanceAdapter().loadBase({})).rejects.toMatchObject({ status: undefined, code: 'MODEL_PERFORMANCE_API_ERROR' });
  });
});
