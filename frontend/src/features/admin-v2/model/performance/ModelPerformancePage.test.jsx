import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ModelPerformancePage from './ModelPerformancePage';

function base(overrides = {}) {
  return {
    artifactSha256: 'a'.repeat(64), modelVersion: 'model-5.2', generatedAt: '2026-09-01T09:00:00Z',
    evaluation: { referenceHorizonMinutes: 120, referenceRequiredBikeCount: 3, minSampleThreshold: 1000 },
    combinations: [
      { horizonMinutes: 60, requiredBikeCount: 1, sampleCount: 1100, brierScore: 0.0304 },
      { horizonMinutes: 120, requiredBikeCount: 3, sampleCount: 999, brierScore: null },
    ],
    calibrationBins: [{ binLowerPercent: 0, binUpperPercent: 10, sampleCount: 0, meanPredicted: null, actualRate: null }],
    ...overrides,
  };
}

function runtime(overrides = {}) {
  return {
    state: 'SUCCESS', data: {
      status: 'NORMAL', modelVersion: 'model-5.2', artifactSha256: 'a'.repeat(64), modelSource: 'oci://models/model-5.2',
      loadedAt: '2026-09-01T09:10:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5],
      ...overrides,
    },
  };
}

function renderPage({ load = jest.fn().mockResolvedValue({ base: base(), runtime: runtime() }) } = {}) {
  render(<ModelPerformancePage createAdapter={() => ({ load })} />);
  return { load };
}

describe('ModelPerformancePage', () => {
  test('shows the source-backed runtime identity and matching evaluation snapshot separately', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: '성능 · 신뢰도' })).toBeInTheDocument();
    expect(screen.getByText('현재 서빙 모델')).toBeInTheDocument();
    expect(screen.getByText('LIVE INFERENCE')).toBeInTheDocument();
    expect(screen.getByText('현재 서빙 모델과 동일한 버전의 평가 결과')).toBeInTheDocument();
    expect(screen.getByText('평가 snapshot')).toBeInTheDocument();
    expect(screen.getAllByText('model-5.2')).toHaveLength(2);
  });

  test.each([
    ['model version mismatch', runtime({ modelVersion: 'model-5.3' })],
    ['artifact mismatch', runtime({ artifactSha256: 'b'.repeat(64) })],
  ])('marks %s as a runtime/evaluation mismatch', async (_, runtimeResult) => {
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: runtimeResult }) });
    expect(await screen.findByText('현재 서빙 모델과 평가 snapshot 버전이 다름')).toBeInTheDocument();
    expect(screen.queryByText('현재 서빙 모델과 동일한 버전의 평가 결과')).not.toBeInTheDocument();
  });

  test.each(['ERROR', 'FORBIDDEN'])('keeps evaluation metrics visible when runtime is %s', async (state) => {
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: { state, error: new Error('runtime unavailable') } }) });
    expect(await screen.findByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText('실시간 inference runtime 확인 불가')).toBeInTheDocument();
    expect(screen.getByText('0.0304')).toBeInTheDocument();
    expect(screen.getAllByText('표본 부족').length).toBeGreaterThan(0);
  });

  test('renders malformed runtime as unknown without replacing evaluation values', async () => {
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: { state: 'ERROR', error: { code: 'MODEL_RUNTIME_RESPONSE_INVALID' } } }) });
    expect(await screen.findByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText('model-5.2')).toBeInTheDocument();
    expect(screen.queryByText('LIVE INFERENCE')).not.toBeInTheDocument();
  });

  test('keeps preview fixture adapters source-safe when runtime is unavailable', async () => {
    const loadBase = jest.fn().mockResolvedValue(base());
    render(<ModelPerformancePage createAdapter={() => ({ loadBase })} />);
    expect(await screen.findByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText('model-5.2')).toBeInTheDocument();
  });

  test('renders actual diagnostics fields without replacing null evidence', async () => {
    const diagnostics = { state: 'SUCCESS', data: { segments: [{ axis: 'STATION', segmentValue: '1001', status: 'UNKNOWN_INSUFFICIENT_SAMPLES', sampleCount: 149, brierScore: null, baselineBrierScore: null, skillScore: null, shortageRecall: null }] } };
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: runtime(), diagnostics }) });
    expect(await screen.findByRole('heading', { name: '진단' })).toBeInTheDocument();
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getAllByText('UNKNOWN_INSUFFICIENT_SAMPLES')).toHaveLength(2);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  test.each([
    [{ state: 'ACCESS_LIMITED', permission: 'MODEL_DIAGNOSTICS_READ' }, /필요 권한: MODEL_DIAGNOSTICS_READ/],
    [{ state: 'ERROR', error: { code: 'DIAGNOSTICS_SNAPSHOT_MISMATCH' } }, /DIAGNOSTICS_SNAPSHOT_MISMATCH/],
  ])('preserves independent diagnostics states', async (diagnostics, expected) => {
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: runtime(), diagnostics }) });
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.getByText('0.0304')).toBeInTheDocument();
  });

  test('does not render uncontracted runtime fields such as a private path', async () => {
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: runtime({ privatePath: '/private/model/artifact' }) }) });
    expect(await screen.findByText('LIVE INFERENCE')).toBeInTheDocument();
    expect(screen.queryByText('/private/model/artifact')).not.toBeInTheDocument();
  });

  test('preserves the base API error semantics', async () => {
    renderPage({ load: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { status: 403, code: 'ADMIN_PERMISSION_DENIED' })) });
    expect(await screen.findByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: MODEL_METRICS_READ')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '성능 · 신뢰도' })).not.toBeInTheDocument();
  });

  test('preserves Brier, null samples, calibration, and all 20 source combinations', async () => {
    const combinations = Array.from({ length: 20 }, (_, index) => ({
      horizonMinutes: [60, 120, 180, 240][Math.floor(index / 5)], requiredBikeCount: (index % 5) + 1,
      sampleCount: index === 1 ? 999 : 1100 + index, brierScore: index === 1 ? null : 0.0304,
    }));
    renderPage({ load: jest.fn().mockResolvedValue({ base: base({ combinations }), runtime: runtime() }) });
    const table = await screen.findByRole('table', { name: 'source 반환 조합의 Brier score 및 표본 수' });
    expect(within(table).getAllByRole('row')).toHaveLength(21);
    expect(screen.getAllByText('표본 부족')).toHaveLength(1);
    expect(screen.getAllByText('UNKNOWN_INSUFFICIENT_SAMPLES')).toHaveLength(1);
    expect(screen.getAllByText('표본 없음')).toHaveLength(2);
  });

  test('paginates the diagnostics table instead of rendering every segment at once', async () => {
    const segments = Array.from({ length: 120 }, (_, index) => ({
      axis: 'STATION', segmentValue: `${1000 + index}`, status: 'NORMAL', sampleCount: 1200 + index,
      brierScore: 0.0304, baselineBrierScore: 0.0501, skillScore: 0.39, shortageRecall: 0.61,
    }));
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: runtime(), diagnostics: { state: 'SUCCESS', data: { segments } } }) });
    const table = await screen.findByRole('table', { name: 'segment별 성능 진단' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.queryByText('1050')).not.toBeInTheDocument();
    expect(screen.getByText('1–50 / 전체 120건 · 1 / 3 페이지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('1050')).toBeInTheDocument();
    expect(screen.queryByText('1000')).not.toBeInTheDocument();
    expect(screen.getByText('51–100 / 전체 120건 · 2 / 3 페이지')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(within(screen.getByRole('table', { name: 'segment별 성능 진단' })).getAllByRole('row')).toHaveLength(21);
    expect(screen.getByText('101–120 / 전체 120건 · 3 / 3 페이지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  test('omits the diagnostics pager when every segment already fits one page', async () => {
    const segments = Array.from({ length: 50 }, (_, index) => ({ axis: 'STATION', segmentValue: `${2000 + index}`, status: 'NORMAL', sampleCount: 1200 }));
    renderPage({ load: jest.fn().mockResolvedValue({ base: base(), runtime: runtime(), diagnostics: { state: 'SUCCESS', data: { segments } } }) });
    expect(await screen.findByRole('table', { name: 'segment별 성능 진단' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '진단 목록 페이지' })).not.toBeInTheDocument();
    expect(screen.getByText('50개')).toBeInTheDocument();
  });

  test('retries a non-access base error without inventing score values', async () => {
    const load = jest.fn().mockRejectedValueOnce(Object.assign(new Error('server'), { status: 500, code: 'MODEL_PERFORMANCE_API_ERROR' })).mockResolvedValueOnce({ base: base(), runtime: runtime() });
    renderPage({ load });
    expect(await screen.findByText('MODEL_PERFORMANCE_API_ERROR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '성능 · 신뢰도' })).toBeInTheDocument());
    expect(load).toHaveBeenCalledTimes(2);
  });
});
