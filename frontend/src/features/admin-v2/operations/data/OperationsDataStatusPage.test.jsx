import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperationsDataStatusPage from './OperationsDataStatusPage';

const fs = require('fs');
const path = require('path');

function payload(overrides = {}) {
  return {
    referenceTime: '2026-08-31T06:00:00Z', generatedAt: '2026-08-31T06:01:00Z', dataState: 'NORMAL',
    inventory: { dataState: 'NORMAL', expectedStationCount: 3, latestStationCount: 3, missingStationCount: 0, latestCollectedAt: '2026-08-31T05:58:00Z', p50DelayMinutes: 2, p95DelayMinutes: 4, inventoryStatusBreakdown: { NORMAL: 3, UNAVAILABLE: 0 } },
    prediction: { dataState: 'NORMAL', featureAsOf: '2026-08-31T05:00:00Z', generatedAt: '2026-08-31T05:01:00Z', publishedAt: '2026-08-31T05:02:00Z', expiresAt: '2026-08-31T07:00:00Z', predictedStationCount: 3, predictionRowCount: 3, coverageRatio: 1 },
    profile: { dataState: 'NORMAL', activePublicStationCount: 3, profileAvailableStationCount: 3, coverageRatio: 1, latestGeneratedAt: '2026-08-30T06:00:00Z' },
    limitations: ['AFFECTED_SCOPE_NOT_SOURCE_BACKED', 'LAST_NORMAL_REFRESH_NOT_SOURCE_BACKED', 'REASON_LEDGER_NOT_SOURCE_BACKED'],
    ...overrides,
  };
}

function renderPage(load) { return render(<OperationsDataStatusPage createAdapter={() => ({ load })} />); }

describe('OperationsDataStatusPage', () => {
  test('renders loading before the request resolves', () => {
    renderPage(jest.fn(() => new Promise(() => {})));
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
  });

  test('renders source-backed success fields and an accessible inventory breakdown', async () => {
    renderPage(jest.fn().mockResolvedValue(payload()));
    expect(await screen.findByRole('heading', { name: '운영 데이터 상태' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '현재 재고 데이터' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /원본 재고 상태별 대여소 수/ })).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100.0%')).toHaveLength(2);
  });

  test.each(['PARTIAL', 'DELAYED', 'MISSING', 'INSUFFICIENT_DATA'])('keeps root %s as the exact visible data state', async (dataState) => {
    renderPage(jest.fn().mockResolvedValue(payload({ dataState })));
    expect(await screen.findByText(dataState)).toBeInTheDocument();
  });

  test('shows null prediction as no valid batch without zero metrics', async () => {
    renderPage(jest.fn().mockResolvedValue(payload({ prediction: null })));
    expect(await screen.findByText('유효한 예측 배치 없음')).toBeInTheDocument();
    expect(screen.queryByText('예측 행 수')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  test('keeps genuine inventory zero distinct from missing and null delay values', async () => {
    const result = payload();
    result.inventory = { ...result.inventory, expectedStationCount: 0, latestStationCount: 0, missingStationCount: 0, p50DelayMinutes: null, p95DelayMinutes: null, inventoryStatusBreakdown: { NORMAL: 0, MISSING: 2 } };
    renderPage(jest.fn().mockResolvedValue(result));
    expect(await screen.findByText('MISSING')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText('확인 정보 없음').length).toBeGreaterThanOrEqual(2);
  });

  test('maps exact limitation codes without fabricating scope, reason, or last-normal values', async () => {
    renderPage(jest.fn().mockResolvedValue(payload()));
    expect(await screen.findByText('영향 범위는 원본 데이터로 제공되지 않습니다.')).toBeInTheDocument();
    expect(screen.getByText('직전 정상 갱신 시각은 보존된 원본 정보가 아닙니다.')).toBeInTheDocument();
    expect(screen.getByText('원인·사유 이력은 원본 데이터로 제공되지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/affected scope/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last normal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/model version/i)).not.toBeInTheDocument();
  });

  test('does not render sensitive, unsupported, or unapproved dynamic response fields', async () => {
    const result = payload({ modelVersion: 'secret-version', artifact: 'secret-artifact', affectedScope: 'secret-scope', reason: 'secret-reason', limitations: ['AFFECTED_SCOPE_NOT_SOURCE_BACKED', 'UNAPPROVED_LIMITATION'], inventory: { ...payload().inventory, inventoryStatusBreakdown: { NORMAL: 3, INTERNAL_SECRET_STATUS: 99 } } });
    renderPage(jest.fn().mockResolvedValue(result));
    await screen.findByRole('heading', { name: '운영 데이터 상태' });
    expect(screen.queryByText('secret-version')).not.toBeInTheDocument();
    expect(screen.queryByText('secret-artifact')).not.toBeInTheDocument();
    expect(screen.queryByText('secret-scope')).not.toBeInTheDocument();
    expect(screen.queryByText('secret-reason')).not.toBeInTheDocument();
    expect(screen.queryByText('UNAPPROVED_LIMITATION')).not.toBeInTheDocument();
    expect(screen.queryByText('INTERNAL_SECRET_STATUS')).not.toBeInTheDocument();
  });

  test('keeps the compact layout structurally safe at the 1024px and 640px breakpoints', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/features/admin-v2/operations/data/operationsDataStatus.css'), 'utf8');
    expect(css).toContain('@media (max-width: 1024px)');
    expect(css).toContain('.operations-data-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('.operations-data-header dl, .operations-data-metrics, .operations-data-supporting { grid-template-columns: 1fr; }');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_ACCESS_DENIED'], [403, 'ADMIN_PERMISSION_DENIED']])('fails closed for access code %s', async (status, code) => {
    renderPage(jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { status, code })));
    expect(await screen.findByText(code)).toBeInTheDocument();
    expect(screen.getByText('필요 권한: DATA_STATUS_READ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  test('retries a transport failure once the initial request has settled', async () => {
    const load = jest.fn().mockRejectedValueOnce(Object.assign(new Error('network'), { status: 503, code: 'OPS_DATA_STATUS_ERROR' })).mockResolvedValueOnce(payload());
    renderPage(load);
    expect(await screen.findByText('OPS_DATA_STATUS_ERROR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { name: '운영 데이터 상태' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('ignores a stale response after a newer retry request', async () => {
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const failure = Object.assign(new Error('retryable'), { status: 503, code: 'OPS_DATA_STATUS_ERROR' });
    const load = jest.fn().mockImplementationOnce(() => first).mockRejectedValueOnce(failure).mockResolvedValueOnce(payload({ dataState: 'NORMAL' }));
    const { rerender } = render(<OperationsDataStatusPage createAdapter={() => ({ load })} />);
    rerender(<OperationsDataStatusPage createAdapter={() => ({ load })} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('OPS_DATA_STATUS_ERROR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { name: '운영 데이터 상태' })).toBeInTheDocument();
    resolveFirst(payload({ dataState: 'MISSING' }));
    await waitFor(() => expect(screen.queryByText('MISSING')).not.toBeInTheDocument());
  });
});
