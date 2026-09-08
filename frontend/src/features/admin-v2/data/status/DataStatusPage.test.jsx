import { render, screen, waitFor } from '@testing-library/react';
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
