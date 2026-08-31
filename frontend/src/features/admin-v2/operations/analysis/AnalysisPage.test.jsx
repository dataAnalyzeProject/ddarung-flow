import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnalysisPage from './AnalysisPage';

function payload(view = 'WEEKDAY') {
  return {
    referenceTime: '2026-08-30T12:00:00Z', generatedAt: '2026-08-30T12:01:00Z', view, riskType: 'RENTAL', ruleVersion: 'OPS_ANALYSIS_STOCKOUT_V1', windowRuleVersion: 'OPS_ANALYSIS_WINDOW_V1', metric: 'OBSERVED_STOCKOUT_RATE', dataState: 'NORMAL',
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
    expect(screen.getByText('OPS_ANALYSIS_WINDOW_V1')).toBeInTheDocument();
    expect(screen.getByText('66.6%')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /요일 .* 표본/ })).toHaveLength(168);
    expect(screen.getAllByText('2곳').length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: '0시' })).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ view: 'WEEKDAY' }));
  });

  test('uses continuous orange heatmap intensity while keeping zero distinct from missing', async () => {
    const result = payload();
    result.weekdayHourCells[0].observedStockoutRate = 0;
    result.weekdayHourCells[1].observedStockoutRate = null;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    const zero = await screen.findByLabelText(/월요일 0시 · 품절 관측률 0.0%/);
    const missing = screen.getByLabelText(/월요일 1시 · 표본 부족/);
    expect(zero).toHaveStyle({ '--heatmap-intensity': '0' });
    expect(zero).not.toHaveClass('analysis-heatmap-cell--empty');
    expect(missing).toHaveClass('analysis-heatmap-cell--empty');
    expect(screen.getByText('빈 칸은 0%가 아니라 관측 정보가 없는 상태입니다.')).toBeInTheDocument();
  });

  test('keeps the selected heatmap cell sample context visible and changes it on selection', async () => {
    const result = payload();
    result.weekdayHourCells[0].sampleCount = 10;
    result.weekdayHourCells[0].contributingStationCount = 2;
    result.weekdayHourCells[1].observedStockoutRate = .42;
    result.weekdayHourCells[1].sampleCount = 88;
    result.weekdayHourCells[1].contributingStationCount = 6;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('sampleCount 10')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/월요일 1시 · 품절 관측률 42.0%/));
    expect(screen.getByText('sampleCount 88')).toBeInTheDocument();
    expect(screen.getByText('contributingStationCount 6')).toBeInTheDocument();
  });

  test('does not fabricate a missing window rule version', async () => {
    const result = payload();
    result.windowRuleVersion = null;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    const evidence = await screen.findByRole('region', { name: '관측 창과 분석 근거' });
    expect(evidence).toHaveTextContent('window rule version');
    expect(evidence).toHaveTextContent('확인 정보 없음');
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
    fireEvent.click(screen.getByRole('button', { name: '시간대별' }));
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    expect(screen.queryByText('현재 사용할 수 없음')).not.toBeInTheDocument();
    expect(screen.queryByText('요일별 관측 요약')).not.toBeInTheDocument();
    expect(screen.queryByText('OPS_ANALYSIS_STOCKOUT_V1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '요일별' }));
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
    fireEvent.click(screen.getByRole('button', { name: '시간대별' }));
    expect(await screen.findByText('시간대별 관측 요약')).toBeInTheDocument();
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'HOUR' }));
  });

  test('renders normalized bucket comparison tracks without changing actual rates or context', async () => {
    const result = payload();
    result.buckets[0] = { key: 1, sampleCount: 10, contributingStationCount: 2, observedStockoutRate: .1 };
    result.buckets[1] = { key: 2, sampleCount: 20, contributingStationCount: 4, observedStockoutRate: .2 };
    result.buckets[2] = { key: 3, sampleCount: 0, contributingStationCount: 0, observedStockoutRate: null };
    result.buckets[3] = { key: 4, sampleCount: 30, contributingStationCount: 6, observedStockoutRate: 0 };
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    const monday = await screen.findByRole('img', { name: /월요일 비교 막대 .* 실제 품절 관측률 10.0%/ });
    const tuesday = screen.getByRole('img', { name: /화요일 비교 막대 .* 실제 품절 관측률 20.0%/ });
    const wednesday = screen.getByRole('img', { name: /수요일 비교 막대 .* 표본 부족 .* 관측 정보 없음/ });
    expect(monday.querySelector('.analysis-bucket-fill')).toHaveStyle({ '--comparison-fill': '50%' });
    expect(tuesday.querySelector('.analysis-bucket-fill')).toHaveStyle({ '--comparison-fill': '100%' });
    expect(wednesday.querySelector('.analysis-bucket-fill')).toBeNull();
    expect(screen.getByRole('img', { name: /목요일 비교 막대 .* 실제 품절 관측률 0.0%/ }).querySelector('.analysis-bucket-fill')).toHaveStyle({ '--comparison-fill': '6%' });
    expect(screen.getByText('10.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(screen.getByText('표본 10건 · 기여 2곳')).toBeInTheDocument();
    expect(screen.getByText('표본 20건 · 기여 4곳')).toBeInTheDocument();
  });

  test('keeps bucket comparison semantics after switching to HOUR', async () => {
    const weekday = payload('WEEKDAY');
    const hour = payload('HOUR');
    hour.buckets[0].observedStockoutRate = .05;
    hour.buckets[1].observedStockoutRate = .2;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn(({ view }) => Promise.resolve(view === 'HOUR' ? hour : weekday)) })} />);
    await screen.findByText('요일별 관측 요약');
    fireEvent.click(screen.getByRole('button', { name: '시간대별' }));
    const zeroHour = await screen.findByRole('img', { name: /0시 비교 막대 .* 실제 품절 관측률 5.0%/ });
    const oneHour = screen.getByRole('img', { name: /1시 비교 막대 .* 실제 품절 관측률 20.0%/ });
    expect(zeroHour.querySelector('.analysis-bucket-fill')).toHaveStyle({ '--comparison-fill': '25%' });
    expect(oneHour.querySelector('.analysis-bucket-fill')).toHaveStyle({ '--comparison-fill': '100%' });
  });

  test('shows only the four compact coverage summary values', async () => {
    const result = payload();
    result.coverage = { ...result.coverage, selectedWindowProfileCount: 17, profileCoverageRate: .721, cellCoverageRate: .438, usableCellCount: 11, expectedCellCount: 13 };
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    const coverage = await screen.findByLabelText('커버리지 요약');
    expect(coverage).toHaveTextContent('Selected Window Profiles');
    expect(coverage).toHaveTextContent('Profile Coverage');
    expect(coverage).toHaveTextContent('Cell Coverage');
    expect(coverage).toHaveTextContent('Usable / Expected Cells');
    expect(coverage).toHaveTextContent('17');
    expect(coverage).toHaveTextContent('72.1%');
    expect(coverage).toHaveTextContent('43.8%');
    expect(coverage).toHaveTextContent('11 / 13');
    expect(screen.queryByText('활성 공개 대여소')).not.toBeInTheDocument();
    expect(screen.queryByText('프로필 보유')).not.toBeInTheDocument();
    expect(screen.queryByText('파싱 완료')).not.toBeInTheDocument();
  });

  test('keeps insufficient data distinct from a zero observed rate', async () => {
    const result = payload();
    result.dataState = 'INSUFFICIENT_DATA';
    result.buckets[0].observedStockoutRate = 0;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('INSUFFICIENT_DATA')).toBeInTheDocument();
    expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
  });

  test.each([
    ['EMPTY', '표시할 항목 없음'],
    ['MISSING', '관측 데이터가 누락되었습니다.'],
    ['DELAYED', '정보 갱신 지연'],
    ['INSUFFICIENT_DATA', '판단에 필요한 정보 부족'],
    ['UNAVAILABLE', '현재 사용할 수 없음'],
  ])('keeps the known %s state explicit', async (dataState, expectedCopy) => {
    const result = payload();
    result.dataState = dataState;
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText(expectedCopy)).toBeInTheDocument();
    if (dataState === 'EMPTY' || dataState === 'MISSING' || dataState === 'UNAVAILABLE') expect(screen.queryByText('요일별 관측 요약')).not.toBeInTheDocument();
  });

  test('renders EMPTY without unavailable copy or a fabricated chart', async () => {
    const result = payload();
    result.dataState = 'EMPTY';
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('표시할 항목 없음')).toBeInTheDocument();
    expect(screen.queryByText('현재 사용할 수 없음')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '요일별 관측 요약' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '요일별' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('renders MISSING as data absence rather than generic partial data', async () => {
    const result = payload();
    result.dataState = 'MISSING';
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('관측 데이터가 누락되었습니다.')).toBeInTheDocument();
    expect(screen.getByText(/MISSING · 관측 근거가 없어 분석 차트를 표시하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByText('일부 정보만 사용 가능')).not.toBeInTheDocument();
    expect(screen.queryByText('현재 사용할 수 없음')).not.toBeInTheDocument();
  });

  test('keeps the HOUR tab and retry after a transient HOUR failure', async () => {
    let hourAttempts = 0;
    const transient = Object.assign(new Error('temporary'), { status: 503, code: 'OPS_ANALYSIS_TEMPORARY' });
    const hourPayload = payload('HOUR');
    hourPayload.ruleVersion = 'OPS_ANALYSIS_HOUR_TEST_V1';
    hourPayload.windowRuleVersion = 'OPS_ANALYSIS_HOUR_WINDOW_TEST_V1';
    const load = jest.fn(({ view }) => {
      if (view === 'WEEKDAY') return Promise.resolve(payload('WEEKDAY'));
      hourAttempts += 1;
      return hourAttempts === 1 ? Promise.reject(transient) : Promise.resolve(hourPayload);
    });
    render(<AnalysisPage createAdapter={() => ({ load })} />);
    await screen.findByText('요일별 관측 요약');
    fireEvent.click(screen.getByRole('button', { name: '시간대별' }));
    expect(await screen.findByText('오류가 발생했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '시간대별' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('요일별 관측 요약')).not.toBeInTheDocument();
    expect(screen.queryByText('OPS_ANALYSIS_STOCKOUT_V1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('시간대별 관측 요약')).toBeInTheDocument();
    expect(screen.getByText('OPS_ANALYSIS_HOUR_TEST_V1')).toBeInTheDocument();
    expect(screen.getByText('OPS_ANALYSIS_HOUR_WINDOW_TEST_V1')).toBeInTheDocument();
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'HOUR' }));
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_PERMISSION_DENIED']])('fails closed for %s access errors without retrying or showing prior view context', async (status, code) => {
    const error = Object.assign(new Error('denied'), { status, code });
    const load = jest.fn(({ view }) => view === 'WEEKDAY' ? Promise.resolve(payload('WEEKDAY')) : Promise.reject(error));
    render(<AnalysisPage createAdapter={() => ({ load })} />);
    await screen.findByText('요일별 관측 요약');
    fireEvent.click(screen.getByRole('button', { name: '시간대별' }));
    expect(await screen.findByText('필요 권한: OPS_ANALYSIS_READ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    expect(screen.queryByText('요일별 관측 요약')).not.toBeInTheDocument();
    expect(screen.queryByText('OPS_ANALYSIS_STOCKOUT_V1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '시간대별' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('fails closed for an unknown data state', async () => {
    const result = payload();
    result.dataState = 'UNKNOWN_NEW_STATE';
    render(<AnalysisPage createAdapter={() => ({ load: jest.fn().mockResolvedValue(result) })} />);
    expect(await screen.findByText('현재 사용할 수 없음')).toBeInTheDocument();
    expect(screen.queryByText('요일별 관측 요약')).not.toBeInTheDocument();
  });
});
