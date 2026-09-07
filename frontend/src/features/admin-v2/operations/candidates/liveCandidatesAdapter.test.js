import { CandidatesApiError, createLiveCandidatesAdapter } from './liveCandidatesAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

describe('live candidates adapter', () => {
  beforeEach(() => { global.fetch = jest.fn(); window.sessionStorage.clear(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('uses the production endpoint with every approved query and preserves the opaque cursor', async () => {
    global.fetch.mockResolvedValue(response({ items: [] }));
    const signal = new AbortController().signal;
    await createLiveCandidatesAdapter().load({ horizonMinutes: 120, requiredBikeCount: 3, limit: 25, cursor: 'opaque-cursor', signal });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/ops/candidates?horizonMinutes=120&requiredBikeCount=3&riskType=RENTAL&limit=25&cursor=opaque-cursor', { credentials: 'include', signal });
  });

  test('appends the risk-map scope snapshot from sessionStorage on a fresh (uncursored) load', async () => {
    window.sessionStorage.setItem('adminOpsRiskSnapshot:60:1', 'snapshot-1');
    global.fetch.mockResolvedValue(response({ items: [] }));
    await createLiveCandidatesAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1, limit: 25 });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/ops/candidates?horizonMinutes=60&requiredBikeCount=1&riskType=RENTAL&limit=25&snapshotId=snapshot-1', expect.anything());
  });

  test('does not append a stored snapshot alongside a cursor, which already carries its own', async () => {
    window.sessionStorage.setItem('adminOpsRiskSnapshot:60:1', 'snapshot-1');
    global.fetch.mockResolvedValue(response({ items: [] }));
    await createLiveCandidatesAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1, limit: 25, cursor: 'opaque-cursor' });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/ops/candidates?horizonMinutes=60&requiredBikeCount=1&riskType=RENTAL&limit=25&cursor=opaque-cursor', expect.anything());
  });

  test('clears an expired stored snapshot and retries the fresh load without it', async () => {
    window.sessionStorage.setItem('adminOpsRiskSnapshot:60:1', 'snapshot-1');
    global.fetch
      .mockResolvedValueOnce(response({ code: 'RISK_SNAPSHOT_EXPIRED', message: '만료' }, 409))
      .mockResolvedValueOnce(response({ items: [], dataState: 'INSUFFICIENT_DATA' }));
    const result = await createLiveCandidatesAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1, limit: 25 });
    expect(result).toMatchObject({ dataState: 'INSUFFICIENT_DATA', scopeExpired: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/admin/ops/candidates?horizonMinutes=60&requiredBikeCount=1&riskType=RENTAL&limit=25', expect.anything());
    expect(window.sessionStorage.getItem('adminOpsRiskSnapshot:60:1')).toBeNull();
  });

  test('does not retry an expired cursor, whose own embedded snapshot id would expire again', async () => {
    global.fetch.mockResolvedValue(response({ code: 'RISK_SNAPSHOT_EXPIRED', message: '만료' }, 409));
    await expect(createLiveCandidatesAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1, limit: 25, cursor: 'opaque-cursor' })).rejects.toMatchObject({ code: 'RISK_SNAPSHOT_EXPIRED' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_PERMISSION_DENIED'], [500, 'OPS_READ_FAILED']])('keeps structured errors for %i', async (status, code) => {
    global.fetch.mockResolvedValue(response({ code, message: '읽기 실패' }, status));
    await expect(createLiveCandidatesAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1, limit: 25 })).rejects.toMatchObject({ status, code, message: '읽기 실패' });
  });

  test('uses a safe fallback code when the error response body is absent', () => {
    expect(new CandidatesApiError({ status: 500 })).toMatchObject({ status: 500, code: 'OPS_API_ERROR' });
  });
});
