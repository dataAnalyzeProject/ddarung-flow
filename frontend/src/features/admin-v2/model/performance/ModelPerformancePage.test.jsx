import { render, screen, waitFor, within } from '@testing-library/react';
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

function renderPage({ loadBase = jest.fn().mockResolvedValue(base()), loadDiagnostics = jest.fn().mockResolvedValue({ segments: [] }) } = {}) {
  return render(<ModelPerformancePage createAdapter={() => ({ loadBase, loadDiagnostics })} />);
}

describe('ModelPerformancePage', () => {
  test('renders only source-backed base metrics and makes runtime identity explicitly unknown', async () => {
    renderPage({ loadDiagnostics: jest.fn().mockResolvedValue({ segments: [{ axis: 'STATION_SIZE', segmentValue: 'LARGE', sampleCount: 1000, brierScore: 0.051 }] }) });
    expect(await screen.findByRole('heading', { name: '모델 검증' })).toBeInTheDocument();
    expect(screen.getByText('runtime serving identity')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText('0.0304')).toBeInTheDocument();
    expect(screen.getAllByText('표본 부족').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNKNOWN_INSUFFICIENT_SAMPLES').length).toBeGreaterThan(0);
    expect(screen.getAllByText('표본 없음')).toHaveLength(2);
    expect(screen.getByText('LARGE')).toBeInTheDocument();
    expect(screen.queryByText(/가중 Brier/)).not.toBeInTheDocument();
    expect(screen.queryByText(/서비스 운영 모델/)).not.toBeInTheDocument();
    expect(screen.getByText('2개 조합')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'source 반환 조합의 Brier score 및 표본 수' })).getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText('source 조합 없음')).not.toBeInTheDocument();
  });

  test('keeps the base page visible and limits diagnostics when diagnostics permission is missing', async () => {
    renderPage({ loadDiagnostics: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { status: 403, code: 'ADMIN_PERMISSION_DENIED' })) });
    expect(await screen.findByRole('heading', { name: '모델 검증' })).toBeInTheDocument();
    expect(await screen.findByText('진단 접근 제한', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('STATION')).not.toBeInTheDocument();
  });

  test('does not display diagnostics when its snapshot differs from the base snapshot', async () => {
    renderPage({ loadDiagnostics: jest.fn().mockRejectedValue(Object.assign(new Error('mismatch'), { code: 'DIAGNOSTICS_SNAPSHOT_MISMATCH' })) });
    expect(await screen.findByText('진단 스냅샷 일치 확인 불가')).toBeInTheDocument();
  });

  test('renders a missing base snapshot as empty rather than a system error', async () => {
    renderPage({ loadBase: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { status: 404, code: 'MODEL_PERFORMANCE_NOT_FOUND' })) });
    expect(await screen.findByText('표시할 항목 없음')).toBeInTheDocument();
    expect(screen.getByText('MODEL_PERFORMANCE_NOT_FOUND')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '모델 검증' })).not.toBeInTheDocument();
    expect(screen.queryByText('오류가 발생했습니다')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: '모델 검증' })).not.toBeInTheDocument();
  });

  test('keeps the base page visible and preserves AUTH_REQUIRED for diagnostics 401', async () => {
    renderPage({ loadDiagnostics: jest.fn().mockRejectedValue(Object.assign(new Error('login'), { status: 401, code: 'AUTH_REQUIRED' })) });
    expect(await screen.findByRole('heading', { name: '모델 검증' })).toBeInTheDocument();
    expect(await screen.findByText('AUTH_REQUIRED')).toBeInTheDocument();
    expect(screen.queryByText('진단 접근 제한', { exact: false })).not.toBeInTheDocument();
  });

  test('keeps the base page visible and distinguishes absent diagnostics from empty diagnostics', async () => {
    renderPage({ loadDiagnostics: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { status: 404, code: 'MODEL_PERFORMANCE_NOT_FOUND' })) });
    expect(await screen.findByRole('heading', { name: '모델 검증' })).toBeInTheDocument();
    expect(await screen.findByText('진단 source가 현재 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('진단 source에 표시할 항목이 없습니다.')).not.toBeInTheDocument();
  });

  test('keeps the base page visible and distinguishes diagnostics server and transport failures', async () => {
    const { rerender } = renderPage({ loadDiagnostics: jest.fn().mockRejectedValue(Object.assign(new Error('server'), { status: 500, code: 'MODEL_PERFORMANCE_API_ERROR' })) });
    expect(await screen.findByText('진단 서버 오류입니다.')).toBeInTheDocument();
    expect(screen.getByText('MODEL_PERFORMANCE_API_ERROR')).toBeInTheDocument();
    rerender(<ModelPerformancePage createAdapter={() => ({ loadBase: jest.fn().mockResolvedValue(base()), loadDiagnostics: jest.fn().mockRejectedValue(new Error('network')) })} />);
    expect(await screen.findByText('진단 source와 통신할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('진단 서버 오류입니다.')).not.toBeInTheDocument();
  });

  test('keeps base content available while diagnostics is still loading', async () => {
    let resolveDiagnostics;
    renderPage({ loadDiagnostics: jest.fn(() => new Promise((resolve) => { resolveDiagnostics = resolve; })) });
    expect(await screen.findByRole('heading', { name: '모델 검증' })).toBeInTheDocument();
    expect(screen.getByText('진단 권한과 source를 확인하는 중입니다.')).toBeInTheDocument();
    resolveDiagnostics({ segments: [] });
    await waitFor(() => expect(screen.getByText('진단 source에 표시할 항목이 없습니다.')).toBeInTheDocument());
  });
});
