import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DataStatusPage from './DataStatusPage';

const result = {
  referenceTime: '2026-09-08T02:00:00Z', generatedAt: '2026-09-08T02:01:00Z', dataState: 'PARTIAL',
  permissions: ['DATA_STATUS_READ'],
  inventory: { dataState: 'PARTIAL', expectedStationCount: 10, latestStationCount: 9, missingStationCount: 1, inventoryStatusBreakdown: { NORMAL: 9, MISSING: 1 } },
  globalRisk: { dataState: 'PARTIAL', resultId: 'global-1', freshUntil: '2026-09-08T02:20:00Z', expiresAt: '2026-09-08T02:30:00Z', activePublicStationCount: 10, evaluatedStationCount: 9, normalInferenceCount: 9, inventoryMissingCount: 1, inventoryDelayedCount: 0, inventoryUnavailableCount: 0, inferenceInsufficientCount: 0, unevaluatedCount: 0, generationDurationMs: 1200, modelVersion: 'model-v1' },
  runtimeAnalysis: { dataState: 'INSUFFICIENT_DATA', hasRecentSnapshot: false },
  profile: { dataState: 'PARTIAL', activePublicStationCount: 10, profileAvailableStationCount: 8, coverageRatio: 0.8 },
  prediction: null,
};

test('separates Global, MAP, history, and factual missing counts', async () => {
  const adapter = { load: () => Promise.resolve(result), listExports: jest.fn() };
  render(<DataStatusPage createAdapter={() => adapter} />);
  expect(await screen.findByRole('heading', { name: '데이터 상태' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '서울 전체 Global 운영 분석' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '현재 지도 범위' })).toBeInTheDocument();
  expect(screen.getByText('지연 재고')).toBeInTheDocument();
  expect(screen.getByText('재고 지연')).toBeInTheDocument();
  expect(screen.getByText('fresh until')).toBeInTheDocument();
  expect(screen.getByText('model-v1')).toBeInTheDocument();
  expect(screen.getByText('아직 분석한 범위 없음')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '예측 배치 (이력 전용)' })).toBeInTheDocument();
  await waitFor(() => expect(adapter.listExports).not.toHaveBeenCalled());
});

test('collapses every block by default and keeps each block state visible while collapsed', async () => {
  const adapter = { load: () => Promise.resolve(result), listExports: jest.fn() };
  render(<DataStatusPage createAdapter={() => adapter} />);
  expect(await screen.findByRole('heading', { name: '데이터 상태' })).toBeInTheDocument();

  const blocks = ['현재 재고', '서울 전체 Global 운영 분석', '현재 지도 범위', 'Profile', '예측 배치 (이력 전용)', '데이터 내보내기'];
  const details = blocks.map((name) => screen.getByRole('heading', { name }).closest('details'));
  details.forEach((block, index) => {
    expect(block).not.toBeNull();
    expect(block.open).toBe(false);
    expect(within(block).getByRole('heading', { name: blocks[index] })).toBeVisible();
  });

  // the collapsed summaries still carry every block's data state, so nothing factual is hidden by folding
  const summaryStates = details.slice(0, 5).map((block) => within(block.querySelector('summary')).getByRole('mark').textContent);
  expect(summaryStates).toEqual(['일부 사용 가능', '일부 사용 가능', '판단 정보 부족', '일부 사용 가능', '확인 정보 없음']);
});

test('expands a block on click without changing what it reports', async () => {
  const adapter = { load: () => Promise.resolve(result), listExports: jest.fn() };
  render(<DataStatusPage createAdapter={() => adapter} />);
  const block = (await screen.findByRole('heading', { name: '서울 전체 Global 운영 분석' })).closest('details');
  fireEvent.click(block.querySelector('summary'));
  expect(block.open).toBe(true);
  expect(within(block).getByText('fresh until')).toBeVisible();
  expect(within(block).getByText('model-v1')).toBeVisible();
});
