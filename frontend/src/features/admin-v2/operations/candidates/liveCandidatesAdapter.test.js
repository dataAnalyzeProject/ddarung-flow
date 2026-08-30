import { CandidatesApiError, createLiveCandidatesAdapter } from './liveCandidatesAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

describe('live candidates adapter', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('uses the production endpoint with every approved query and preserves the opaque cursor', async () => {
    global.fetch.mockResolvedValue(response({ items: [] }));
    const signal = new AbortController().signal;
    await createLiveCandidatesAdapter().load({ horizonMinutes: 120, requiredBikeCount: 3, limit: 25, cursor: 'opaque-cursor', signal });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/ops/candidates?horizonMinutes=120&requiredBikeCount=3&riskType=RENTAL&limit=25&cursor=opaque-cursor', { credentials: 'include', signal });
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_PERMISSION_DENIED'], [500, 'OPS_READ_FAILED']])('keeps structured errors for %i', async (status, code) => {
    global.fetch.mockResolvedValue(response({ code, message: '읽기 실패' }, status));
    await expect(createLiveCandidatesAdapter().load({ horizonMinutes: 60, requiredBikeCount: 1, limit: 25 })).rejects.toMatchObject({ status, code, message: '읽기 실패' });
  });

  test('uses a safe fallback code when the error response body is absent', () => {
    expect(new CandidatesApiError({ status: 500 })).toMatchObject({ status: 500, code: 'OPS_API_ERROR' });
  });
});
