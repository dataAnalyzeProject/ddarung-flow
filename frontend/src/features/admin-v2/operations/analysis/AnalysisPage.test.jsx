import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnalysisPage from './AnalysisPage';

function payload(view = 'WEEKDAY') {
  return {
    referenceTime: '2026-08-30T12:00:00Z', generatedAt: '2026-08-30T12:01:00Z', view, riskType: 'RENTAL', ruleVersion: 'OPS_ANALYSIS_STOCKOUT_V1', metric: 'OBSERVED_STOCKOUT_RATE', dataState: 'NORMAL',
    selectedWindowStart: '2026-08-01', selectedWindowEnd: '2026-08-28', selectedWindowProfileCount: 2, excludedDifferentWindowProfileCount: 1,
    coverage: { activePublicStationCount: 3, profileAvailableCount: 3, selectedWindowProfileCount: 2, parsedProfileCount: 2, usableCellCount: 2, expectedCellCount: 336, profileCoverageRate: .666, cellCoverageRate: .006 },
    buckets: Array.from({ length: view === 'HOUR' ? 24 : 7 }, (_, key) => ({ key: view === 'HOUR' ? key : key + 1, sampleCount: key === 0 ? 10 : 0, contributingStationCount: key === 0 ? 2 : 0, observedStockoutRate: key === 0 ? .3 : null })),
    weekdayHourCells: Array.from({ length: 168 }, (_, index) => ({ dayOfWeek: Math.floor(index / 24) + 1, hourOfDay: index % 24, sampleCount: index === 0 ? 10 : 0, contributingStationCount: index === 0 ? 2 : 0, observedStockoutRate: index === 0 ? .3 : null })),
    limitations: ['DISTRICT_SOURCE_MISSING'],
  };
}

describe('AnalysisPage', () => {
  test('renders historical evidence, coverage, buckets, and all 168 accessible heatmap cells', async () => {
    const load = jest.fn().mockResolvedValue(payload());
    render(<AnalysisPage createAdapter={() => ({ load })} />);
    expect(await screen.findByRole('heading', { name: '반복 품절 패턴' })).toBeInTheDocument();
    expect(screen.getByText('미래 예측이 아닌 과거 실제 관측을 요일·시간대별로 확인합니다.')).toBeInTheDocument();
    expect(screen.getByText('OPS_ANALYSIS_STOCKOUT_V1')).toBeInTheDocument();
    expect(screen.getByText('프로필 66.6%')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/요일 .* 표본/)).toHaveLength(168);
    expect(screen.getAllByText('2곳').length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: '0시' })).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ view: 'WEEKDAY' }));
  });

  test('switches only the approved view and ignores a stale request', async () => {
    let resolveHour;
    const hour = new Promise((resolve) => { resolveHour = resolve; });
    let weekdayCalls = 0;
    const load = jest.fn(({ view }) => {
      if (view === 'HOUR') return hour;
      weekdayCalls += 1;
      return Promise.resolve(payload('WEEKDAY'));
    });
    render(<AnalysisPage createAdapter={() => ({ load })} />);
    await screen.findByText('요일별 관측 요약');
    fireEvent.click(screen.getByRole('button', { name: 'HOUR' }));
    fireEvent.click(screen.getByRole('button', { name: 'WEEKDAY' }));
    await screen.findByText('요일별 관측 요약');
    resolveHour(payload('HOUR'));
    await Promise.resolve();
    await waitFor(() => expect(screen.queryByText('시간대별 관측 요약')).not.toBeInTheDocument());
    expect(weekdayCalls).toBe(2);
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'WEEKDAY' }));
  });

  test('requests and renders the HOUR view only after its tab is selected', async () => {
    const load = jest.fn(({ view }) => Promise.resolve(payload(view)));
    render(<AnalysisPage createAdapter={() => ({ load })} />);
    await screen.findByText('요일별 관측 요약');
    fireEvent.click(screen.getByRole('button', { name: 'HOUR' }));
    expect(await screen.findByText('시간대별 관측 요약')).toBeInTheDocument();
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'HOUR' }));
  });

  test('keeps insufficient data distinct from a zero observed rate', async () => {
    const result = payload();
    result.dataState = 'INSUFFICIENT_DATA';
    result.buckets[0].observedStockoutRate = 0;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('INSUFFICIENT_DATA')).toBeInTheDocument();
    expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
  });

  test('shows a permission state without treating it as an empty analysis', async () => {
    const error = Object.assign(new Error('denied'), { status: 403, code: 'ADMIN_PERMISSION_DENIED' });
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockRejectedValue(error) })} />);
    expect(await screen.findByText('필요 권한: OPS_ANALYSIS_READ')).toBeInTheDocument();
  });

  test('fails closed for an unknown data state', async () => {
    const result = payload();
    result.dataState = 'UNKNOWN_NEW_STATE';
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('현재 사용할 수 없음')).toBeInTheDocument();
    expect(screen.queryByText('요일별 관측 요약')).not.toBeInTheDocument();
  });
});
