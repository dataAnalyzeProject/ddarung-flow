import { createOperationsDataStatusAdapter, OperationsDataStatusApiError } from './operationsDataStatusAdapter';

function response(status, body = {}) { return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) }; }

describe('operationsDataStatusAdapter', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; delete process.env.REACT_APP_API_BASE_URL; });

  test('uses the exact endpoint, cookies, and supplied AbortSignal', async () => {
    process.env.REACT_APP_API_BASE_URL = 'https://api.example.test';
    global.fetch = jest.fn().mockResolvedValue(response(200, { dataState: 'NORMAL' }));
    const signal = new AbortController().signal;
    await expect(createOperationsDataStatusAdapter().load({ signal })).resolves.toEqual({ dataState: 'NORMAL' });
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/v1/admin/ops/data-status', { credentials: 'include', signal });
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_ACCESS_DENIED'], [403, 'ADMIN_PERMISSION_DENIED'], [500, 'OPS_DATA_STATUS_ERROR']])('preserves safe HTTP error code for %s', async (status, code) => {
    global.fetch = jest.fn().mockResolvedValue(response(status, { code }));
    await expect(createOperationsDataStatusAdapter().load({ signal: new AbortController().signal })).rejects.toMatchObject({ name: 'OperationsDataStatusApiError', status, code });
  });

  test('normalizes network errors as safe request errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network failed'));
    await expect(createOperationsDataStatusAdapter().load({ signal: new AbortController().signal })).rejects.toMatchObject({ name: 'OperationsDataStatusApiError', code: 'OPS_DATA_STATUS_ERROR' });
    expect(new OperationsDataStatusApiError({ status: 500 }).code).toBe('OPS_DATA_STATUS_ERROR');
  });
});
