import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CandidatesPage from './CandidatesPage';

const first = {
  referenceTime: '2026-08-30T00:00:00Z', generatedAt: '2026-08-30T00:01:00Z', horizonMinutes: 60, requiredBikeCount: 1, riskType: 'RENTAL', dataState: 'NORMAL',
  coverage: { activePublicStationCount: 10, analyzedStationCount: 9, analysisNormalCount: 8, profileAvailableCount: 7, eligibleCandidateCount: 2 }, limitations: ['STATION_NUMBER_MISSING'], nextCursor: 'opaque-next',
  items: [
    { rank: 2, dataState: 'NORMAL', station: { name: '두 번째', stationNumber: '1002', currentBikes: null }, prediction: { selectedShortageProbability: 0.5, predictionTargetAt: '2026-08-30T01:00:00Z' }, recurrence: { available: false, reasonCode: 'RECURRENCE_PROFILE_MISSING' } },
    { rank: 1, dataState: 'NORMAL', station: { name: '첫 번째', stationNumber: '1001', currentBikes: 0 }, prediction: { selectedShortageProbability: 0.9, predictionTargetAt: '2026-08-30T02:00:00Z' }, recurrence: { available: true, sampleCount: 12, observedStockoutRate: 0.25, windowStart: '2026-08-01', windowEnd: '2026-08-28', episodeCount: 3, medianBikeCount: 0, medianDurationMinutes: 10, p90DurationMinutes: 20, medianRecoveryMinutesToThree: 5 } },
  ],
};

function adapterFor(load) { return () => ({ load }); }
function deferred() { let resolve; let reject; return { promise: new Promise((done, fail) => { resolve = done; reject = fail; }), resolve, reject }; }

describe('CandidatesPage', () => {
  test('displays API rank order unchanged, preserves zero/null inventory, and keeps recurrence as evidence', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve(first))} />);
    expect(await screen.findByRole('heading', { name: '집중관리 목록' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/2두 번째100250.0%.*재고 확인 필요NORMAL/);
    expect(rows[2]).toHaveTextContent(/1첫 번째100190.0%.*0대NORMAL/);
    expect(screen.getByText('반복 품절 근거 없음 (RECURRENCE_PROFILE_MISSING)')).toBeInTheDocument();
    expect(screen.getByText('데이터 범위')).toBeInTheDocument();
    expect(screen.queryByText(/CRITICAL|HIGH|WATCH|위험 단계/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/반복 품절 근거 · 표본 12건/));
    expect(screen.getByText('품절 에피소드')).toBeInTheDocument();
    expect(screen.getAllByText('0대')).toHaveLength(2);
  });

  test('places decision fields before supporting row evidence', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve(first))} />);
    await screen.findByRole('heading', { name: '집중관리 목록' });
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['순위', '대여소', '대여 부족 확률', '예상 시점', '현재 재고', '후보 데이터 상태', '반복 품절 근거']);
    const firstCandidateCells = screen.getAllByRole('row')[1].querySelectorAll('td');
    expect(firstCandidateCells[0]).toHaveTextContent('2');
    expect(firstCandidateCells[1]).toHaveTextContent('두 번째1002');
    expect(firstCandidateCells[2]).toHaveTextContent('50.0%');
    expect(firstCandidateCells[3]).toHaveTextContent(/2026/);
    expect(firstCandidateCells[6]).toHaveTextContent('반복 품절 근거 없음');
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
    [{ items: [], dataState: 'NORMAL' }, '표시할 항목 없음', 'candidates-root-state--normal'],
    [{ items: [], dataState: 'MISSING' }, '일부 정보만 사용 가능', 'candidates-root-state--missing'],
    [{ items: [], dataState: 'DELAYED' }, '정보 갱신 지연', 'candidates-root-state--delayed'],
    [{ items: [], dataState: 'INSUFFICIENT_DATA' }, '판단에 필요한 정보 부족', 'candidates-root-state--insufficient-data'],
    [{ items: [], dataState: 'UNAVAILABLE' }, '현재 사용할 수 없음', 'candidates-root-state--unavailable'],
  ])('renders root %s state distinctly', async (partial, label, stateClass) => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, ...partial }))} />);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(within(screen.getByLabelText('목록 기준')).getByText(partial.dataState)).toHaveClass('candidates-root-state', stateClass);
  });

  test('offers the risk map as a safe entry point when no scope has been analyzed yet', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, items: [], dataState: 'INSUFFICIENT_DATA', limitations: ['ANALYSIS_SCOPE_REQUIRED'] }))} />);
    expect(await screen.findByText('판단에 필요한 정보 부족')).toBeInTheDocument();
    expect(screen.getByText(/아직 분석한 범위가 없습니다\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '수급 위험 지도에서 범위를 분석해 주세요.' })).toHaveAttribute('href', '/admin/ops/risk-map');
  });

  test('distinguishes an expired analysis from one that was never run', async () => {
    // The backend can only report ANALYSIS_SCOPE_REQUIRED after the adapter drops an expired
    // snapshot id and retries; scopeExpired is how the adapter carries the difference forward.
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, items: [], dataState: 'INSUFFICIENT_DATA', limitations: ['ANALYSIS_SCOPE_REQUIRED'], scopeExpired: true }))} />);
    expect(await screen.findByText(/이전 분석이 만료됐습니다\./)).toBeInTheDocument();
    expect(screen.queryByText(/아직 분석한 범위가 없습니다\./)).not.toBeInTheDocument();
  });

  test('uses a neutral root state badge for an unsupported source value', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, dataState: 'UNKNOWN_SOURCE_STATE' }))} />);
    expect(await screen.findByText('UNKNOWN_SOURCE_STATE')).toHaveClass('candidates-root-state', 'candidates-root-state--unknown');
  });

  test.each([[403, 'OPS_CANDIDATE_READ'], [500, null]])('renders access/error state for request failures', async (status, permission) => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.reject({ status, code: 'REQUEST_FAILED' }))} />);
    expect(await screen.findByText('REQUEST_FAILED')).toBeInTheDocument();
    if (permission) expect(screen.getByText(`필요 권한: ${permission}`)).toBeInTheDocument();
  });

  test('cancels stale load-more when filters change and keeps the new cursor usable', async () => {
    const initial = deferred();
    const staleMore = deferred();
    const filtered = deferred();
    const nextFilteredPage = deferred();
    const load = jest.fn(({ horizonMinutes, cursor }) => {
      if (horizonMinutes === 60 && !cursor) return initial.promise;
      if (horizonMinutes === 60 && cursor === 'old-cursor') return staleMore.promise;
      if (horizonMinutes === 120 && !cursor) return filtered.promise;
      if (horizonMinutes === 120 && cursor === 'new-cursor') return nextFilteredPage.promise;
      throw new Error('unexpected request');
    });
    render(<CandidatesPage createAdapter={adapterFor(load)} />);
    await act(async () => initial.resolve({ ...first, nextCursor: 'old-cursor', items: [{ ...first.items[0], station: { ...first.items[0].station, name: '기존 후보' } }] }));
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 60, cursor: 'old-cursor' })));

    fireEvent.change(screen.getByLabelText('예측 horizon'), { target: { value: '120' } });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120 })));
    expect(load.mock.calls.at(-1)[0]).not.toHaveProperty('cursor');
    await act(async () => filtered.resolve({ ...first, nextCursor: 'new-cursor', items: [{ ...first.items[1], station: { ...first.items[1].station, name: '새 필터 후보' } }] }));
    expect(await screen.findByText('새 필터 후보')).toBeInTheDocument();

    await act(async () => staleMore.resolve({ ...first, nextCursor: null, items: [{ ...first.items[0], station: { ...first.items[0].station, name: 'stale 후보' } }] }));
    expect(screen.queryByText('stale 후보')).not.toBeInTheDocument();
    const loadMoreButton = screen.getByRole('button', { name: '더 보기' });
    expect(loadMoreButton).not.toBeDisabled();
    fireEvent.click(loadMoreButton);
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, cursor: 'new-cursor' })));
    await act(async () => nextFilteredPage.resolve({ ...first, nextCursor: null, items: [{ ...first.items[0], rank: 3, station: { ...first.items[0].station, name: '새 페이지 후보' } }] }));
    expect(await screen.findByText('새 페이지 후보')).toBeInTheDocument();
  });
});
