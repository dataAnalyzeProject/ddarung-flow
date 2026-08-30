import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CandidatesPage from './CandidatesPage';

const first = {
  referenceTime: '2026-08-30T00:00:00Z', generatedAt: '2026-08-30T00:01:00Z', horizonMinutes: 60, requiredBikeCount: 1, riskType: 'RENTAL', dataState: 'NORMAL',
  coverage: { activePublicStationCount: 10, inventoryAvailableCount: 9, predictionAvailableCount: 8, profileAvailableCount: 7, eligibleCandidateCount: 2 }, limitations: ['STATION_NUMBER_MISSING'], nextCursor: 'opaque-next',
  items: [
    { rank: 2, dataState: 'NORMAL', station: { name: '두 번째', stationNumber: '1002', currentBikes: null }, prediction: { selectedShortageProbability: 0.5, predictionTargetAt: '2026-08-30T01:00:00Z' }, recurrence: { available: false, reasonCode: 'RECURRENCE_PROFILE_MISSING' } },
    { rank: 1, dataState: 'NORMAL', station: { name: '첫 번째', stationNumber: '1001', currentBikes: 0 }, prediction: { selectedShortageProbability: 0.9, predictionTargetAt: '2026-08-30T02:00:00Z' }, recurrence: { available: true, sampleCount: 12, observedStockoutRate: 0.25, windowStart: '2026-08-01', windowEnd: '2026-08-28', episodeCount: 3, medianBikeCount: 0, medianDurationMinutes: 10, p90DurationMinutes: 20, medianRecoveryMinutesToThree: 5 } },
  ],
};

function adapterFor(load) { return () => ({ load }); }

describe('CandidatesPage', () => {
  test('displays API rank order unchanged, preserves zero/null inventory, and keeps recurrence as evidence', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve(first))} />);
    expect(await screen.findByRole('heading', { name: '집중관리 목록' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/2두 번째1002재고 확인 필요50.0%.*NORMAL/);
    expect(rows[2]).toHaveTextContent(/1첫 번째10010대90.0%.*NORMAL/);
    expect(screen.getByText('반복 품절 근거 없음 (RECURRENCE_PROFILE_MISSING)')).toBeInTheDocument();
    expect(screen.getByText('데이터 범위')).toBeInTheDocument();
    expect(screen.queryByText(/CRITICAL|HIGH|WATCH|위험 단계/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/반복 품절 근거 · 표본 12건/));
    expect(screen.getByText('품절 에피소드')).toBeInTheDocument();
    expect(screen.getAllByText('0대')).toHaveLength(2);
  });

  test('sends selected filters and passes nextCursor without interpreting it', async () => {
    const nextPage = { ...first, items: [{ ...first.items[0], rank: 3 }], nextCursor: null };
    const load = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(first).mockResolvedValueOnce(nextPage);
    render(<CandidatesPage createAdapter={adapterFor(load)} />);
    await screen.findByRole('heading', { name: '집중관리 목록' });
    fireEvent.change(screen.getByLabelText('예측 horizon'), { target: { value: '120' } });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, requiredBikeCount: 1, limit: 25 })));
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'opaque-next', horizonMinutes: 120, requiredBikeCount: 1, limit: 25 })));
  });

  test.each([
    [{ items: [], dataState: 'NORMAL' }, '표시할 항목 없음'],
    [{ items: [{ rank: 1 }], dataState: 'MISSING' }, '일부 정보만 사용 가능'],
    [{ items: [{ rank: 1 }], dataState: 'INSUFFICIENT_DATA' }, '판단에 필요한 정보 부족'],
    [{ items: [{ rank: 1 }], dataState: 'UNAVAILABLE' }, '현재 사용할 수 없음'],
  ])('renders root %s state distinctly', async (partial, label) => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, ...partial }))} />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  test.each([[403, 'OPS_CANDIDATE_READ'], [500, null]])('renders access/error state for request failures', async (status, permission) => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.reject({ status, code: 'REQUEST_FAILED' }))} />);
    expect(await screen.findByText('REQUEST_FAILED')).toBeInTheDocument();
    if (permission) expect(screen.getByText(`필요 권한: ${permission}`)).toBeInTheDocument();
  });
});
