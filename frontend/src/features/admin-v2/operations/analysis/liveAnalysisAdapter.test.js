import { AnalysisApiError, createLiveAnalysisAdapter } from './liveAnalysisAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

describe('live analysis adapter', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('uses only the approved production query', async () => {
    global.fetch.mockResolvedValue(response({ buckets: [] }));
    const signal = new AbortController().signal;
    await createLiveAnalysisAdapter().load({ view: 'HOUR', signal });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/ops/analysis?view=HOUR&riskType=RENTAL', { credentials: 'include', signal });
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_PERMISSION_DENIED'], [500, 'OPS_READ_FAILED']])('keeps structured errors for %i', async (status, code) => {
    global.fetch.mockResolvedValue(response({ code, message: '읽기 실패' }, status));
    await expect(createLiveAnalysisAdapter().load({ view: 'WEEKDAY' })).rejects.toMatchObject({ status, code, message: '읽기 실패' });
  });

  test('uses a safe fallback code for an unreadable error body', () => {
    expect(new AnalysisApiError({ status: 500 })).toMatchObject({ status: 500, code: 'OPS_ANALYSIS_ERROR' });
  });
});
