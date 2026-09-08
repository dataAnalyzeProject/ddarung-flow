import { createLiveOpsDashboardAdapter, OpsApiError } from './liveOpsDashboardAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

describe('live operations dashboard adapter', () => {
  beforeEach(() => { global.fetch = jest.fn(); window.sessionStorage.clear(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('requests only the overview until the user chooses a map scope', async () => {
    global.fetch.mockResolvedValueOnce(response({ referenceTime: 'now' }));
    const signal = new AbortController().signal;
    await createLiveOpsDashboardAdapter().load({ horizonMinutes: 120, requiredBikeCount: 3, signal });
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/admin/ops/overview?horizonMinutes=120&requiredBikeCount=3', { credentials: 'include', signal });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls.flat().join(' ')).not.toContain('preview=true');
    expect(global.fetch.mock.calls.flat().join(' ')).not.toContain('district');
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_PERMISSION_DENIED'], [500, 'OPS_READ_FAILED']])('keeps structured overview error details for %i', async (status, code) => {
    global.fetch.mockResolvedValueOnce(response({ code, message: '읽기 실패' }, status));
    await expect(createLiveOpsDashboardAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1 })).rejects.toMatchObject({ status, code, message: '읽기 실패' });
  });

  test('does not make a hidden citywide risk request after a successful overview', async () => {
    global.fetch.mockResolvedValueOnce(response({ referenceTime: 'now' }));
    await expect(createLiveOpsDashboardAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1 })).resolves.toMatchObject({ overview: { referenceTime: 'now' }, risk: null, riskError: null });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('ignores a stored MAP snapshot and uses the Global overview with embedded Top 5', async () => {
    window.sessionStorage.setItem('adminOpsRiskSnapshot:60:1', 'snapshot-1');
    global.fetch.mockResolvedValueOnce(response({ referenceTime: 'now', dataState: 'NORMAL', priorityStations: [{ station: { stationNumber: '1001' } }] }));
    const result = await createLiveOpsDashboardAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1 });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/ops/overview?horizonMinutes=60&requiredBikeCount=1', expect.anything());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.risk.items).toHaveLength(1);
  });

  test('does not require candidate or risk-map permission for Global Top 5', async () => {
    global.fetch.mockResolvedValueOnce(response({ referenceTime: 'now', priorityStations: [] }));
    await expect(createLiveOpsDashboardAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1 })).resolves.toMatchObject({ overview: { referenceTime: 'now' }, risk: null, riskError: null });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('preserves AbortError instead of turning it into an error state', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    global.fetch.mockRejectedValueOnce(abort);
    await expect(createLiveOpsDashboardAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1 })).rejects.toBe(abort);
  });

  test('uses a safe fallback code when an error response has no JSON code', () => {
    expect(new OpsApiError({ status: 500 })).toMatchObject({ status: 500, code: 'OPS_API_ERROR' });
  });
});
