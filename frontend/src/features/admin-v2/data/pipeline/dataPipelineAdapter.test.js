import { createDataPipelineAdapter } from './dataPipelineAdapter';

afterEach(() => { jest.restoreAllMocks(); });

test('loads the canonical pipeline status', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ dataState: 'PARTIAL', stages: [] }) });
  await expect(createDataPipelineAdapter().load()).resolves.toEqual({ dataState: 'PARTIAL', stages: [] });
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/data/pipeline-status', expect.objectContaining({ credentials: 'include' }));
});
