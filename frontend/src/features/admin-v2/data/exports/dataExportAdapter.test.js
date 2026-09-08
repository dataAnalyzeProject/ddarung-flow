import { createDataExportAdapter } from './dataExportAdapter';

test('shares the DATA export implementation with the status adapter', () => {
  expect(createDataExportAdapter()).toEqual(expect.objectContaining({ listExports: expect.any(Function), createExport: expect.any(Function), downloadExport: expect.any(Function) }));
});
