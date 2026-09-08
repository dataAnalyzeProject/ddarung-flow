import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataExportPanel from './DataExportPanel';

test('hides export utility without export permissions', () => {
  render(<DataExportPanel adapter={{}} permissions={['DATA_STATUS_READ']} />);
  expect(screen.queryByRole('heading', { name: '데이터 내보내기' })).not.toBeInTheDocument();
});

test('creates curated export and shows requested and output rows separately', async () => {
  const adapter = { listExports: jest.fn()
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({ items: [{ exportId: 1, source: 'CURATED', format: 'CSV', status: 'COMPLETED', requestedRowCount: 1000, outputRowCount: 12 }] }),
    createExport: jest.fn().mockResolvedValue({ exportId: 1 }) };
  render(<DataExportPanel adapter={adapter} permissions={['DATA_EXPORT_REQUEST']} />);
  await screen.findByText('내보내기 요청이 없습니다.');
  fireEvent.click(screen.getByRole('button', { name: '내보내기 요청' }));
  await waitFor(() => expect(adapter.createExport).toHaveBeenCalledWith(expect.objectContaining({ source: 'CURATED', rowCount: 1000 })));
  expect(await screen.findByText('1,000 / 12')).toBeInTheDocument();
});
