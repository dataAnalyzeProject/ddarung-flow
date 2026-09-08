import { createDataStatusAdapter, DataStatusApiError } from './dataStatusAdapter';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), blob: () => Promise.resolve(new Blob(['x'])), headers: { get: () => null } });

afterEach(() => { jest.restoreAllMocks(); });

test('loads canonical status with permission context', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response({ dataState: 'NORMAL' })).mockResolvedValueOnce(response({ permissions: ['DATA_STATUS_READ'] }));
  await expect(createDataStatusAdapter().load()).resolves.toEqual({ dataState: 'NORMAL', permissions: ['DATA_STATUS_READ'] });
  expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/admin/data/status', expect.objectContaining({ credentials: 'include' }));
});

test('uses csrf for export request and preserves source-unavailable error', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })).mockResolvedValueOnce(response({ code: 'EXPORT_SOURCE_UNAVAILABLE' }, 422));
  await expect(createDataStatusAdapter().createExport({ source: 'QUARANTINE_NORMALIZED', format: 'CSV' })).rejects.toEqual(expect.objectContaining({ code: 'EXPORT_SOURCE_UNAVAILABLE' }));
  expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/admin/exports', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'csrf' }) }));
});

test('maps forbidden status', async () => {
  global.fetch = jest.fn().mockResolvedValue(response({ code: 'ADMIN_PERMISSION_DENIED' }, 403));
  await expect(createDataStatusAdapter().load()).rejects.toBeInstanceOf(DataStatusApiError);
});
