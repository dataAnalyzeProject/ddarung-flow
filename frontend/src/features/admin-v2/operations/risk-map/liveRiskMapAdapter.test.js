import { createLiveRiskMapAdapter, RiskMapApiError } from './liveRiskMapAdapter';

afterEach(() => jest.restoreAllMocks());

test('uses the approved list query and session credentials', async () => {
  const signal = new AbortController().signal;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
  await createLiveRiskMapAdapter().loadList({ horizonMinutes: 120, requiredBikeCount: 3, dataState: 'DELAYED', bbox: '126,37,127,38', limit: 100, cursor: 'opaque', signal });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/ops/risk-stations?horizonMinutes=120&requiredBikeCount=3&dataState=DELAYED&bbox=126%2C37%2C127%2C38&limit=100&cursor=opaque'), { credentials: 'include', signal });
});

test('uses public stationNumber for detail and retains JSON error details', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ code: 'ADMIN_OPS_STATION_NOT_FOUND', message: 'not found' }) });
  await expect(createLiveRiskMapAdapter().loadDetail('1001', { horizonMinutes: 60, requiredBikeCount: 1 })).rejects.toEqual(expect.objectContaining({ status: 404, code: 'ADMIN_OPS_STATION_NOT_FOUND' }));
  expect(fetch.mock.calls[0][0]).toContain('/risk-stations/1001?horizonMinutes=60&requiredBikeCount=1');
  expect(new RiskMapApiError({ status: 403 }).code).toBe('ADMIN_PERMISSION_DENIED');
});
