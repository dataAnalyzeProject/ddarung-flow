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

function renderPage({ loadBase = jest.fn().mockResolvedValue(base()), loadDiagnostics = jest.fn() } = {}) {
  render(<ModelPerformancePage createAdapter={() => ({ loadBase, loadDiagnostics })} />);
  return { loadBase, loadDiagnostics };
}

describe('ModelPerformancePage', () => {
  test('renders only source-backed base metrics and makes runtime identity explicitly unknown', async () => {
    const { loadDiagnostics } = renderPage();
    expect(await screen.findByRole('heading', { name: '성능 · 신뢰도' })).toBeInTheDocument();
    expect(screen.getByText('runtime serving identity —')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText('model-5.2')).toBeInTheDocument();
    expect(screen.getByText('0.0304')).toBeInTheDocument();
    expect(screen.getAllByText('표본 부족').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNKNOWN_INSUFFICIENT_SAMPLES').length).toBeGreaterThan(0);
    expect(screen.getAllByText('표본 없음')).toHaveLength(2);
    expect(screen.queryByText(/전체 Brier/)).not.toBeNull();
    expect(within(screen.getByRole('table', { name: 'source 반환 조합의 Brier score 및 표본 수' })).getAllByRole('row')).toHaveLength(3);
    expect(loadDiagnostics).not.toHaveBeenCalled();
  });

  test('keeps diagnostics out of the page even when a separate adapter function exists', async () => {
    renderPage({ loadDiagnostics: jest.fn().mockResolvedValue({ segments: [{ axis: 'STATION_SIZE', segmentValue: 'LARGE' }] }) });
    expect(await screen.findByRole('heading', { name: '성능 · 신뢰도' })).toBeInTheDocument();
    expect(screen.queryByText('진단')).not.toBeInTheDocument();
    expect(screen.queryByText('LARGE')).not.toBeInTheDocument();
  });

  test('renders a missing base snapshot as empty rather than a system error', async () => {
    renderPage({ loadBase: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { status: 404, code: 'MODEL_PERFORMANCE_NOT_FOUND' })) });
    expect(await screen.findByText('표시할 항목 없음')).toBeInTheDocument();
    expect(screen.getByText('MODEL_PERFORMANCE_NOT_FOUND')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '성능 · 신뢰도' })).not.toBeInTheDocument();
  });

  test('preserves AUTH_REQUIRED for a base 401 without presenting a granular permission denial', async () => {
    renderPage({ loadBase: jest.fn().mockRejectedValue(Object.assign(new Error('login'), { status: 401, code: 'AUTH_REQUIRED' })) });
    expect(await screen.findByText('AUTH_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('관리자 로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.queryByText('필요 권한: MODEL_METRICS_READ')).not.toBeInTheDocument();
  });

  test('keeps MODEL_METRICS_READ denial for a base 403', async () => {
    renderPage({ loadBase: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { status: 403, code: 'ADMIN_PERMISSION_DENIED' })) });
    expect(await screen.findByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: MODEL_METRICS_READ')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '성능 · 신뢰도' })).not.toBeInTheDocument();
  });

  test('keeps source-returned empty combinations distinct from an unavailable base snapshot', async () => {
    renderPage({ loadBase: jest.fn().mockResolvedValue(base({ combinations: [], calibrationBins: [] })) });
    expect(await screen.findByRole('heading', { name: '성능 · 신뢰도' })).toBeInTheDocument();
    expect(screen.getAllByText('표시할 항목 없음')).toHaveLength(2);
    expect(screen.getByText('model-5.2')).toBeInTheDocument();
  });

  test('retries a non-access base error without inventing score values', async () => {
    const loadBase = jest.fn().mockRejectedValueOnce(Object.assign(new Error('server'), { status: 500, code: 'MODEL_PERFORMANCE_API_ERROR' })).mockResolvedValueOnce(base());
    renderPage({ loadBase });
    expect(await screen.findByText('MODEL_PERFORMANCE_API_ERROR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '성능 · 신뢰도' })).toBeInTheDocument());
    expect(loadBase).toHaveBeenCalledTimes(2);
  });
});
