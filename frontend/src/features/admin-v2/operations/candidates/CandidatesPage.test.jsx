import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CandidatesPage from './CandidatesPage';

const first = {
  referenceTime: '2026-08-30T00:00:00Z', generatedAt: '2026-08-30T00:01:00Z', publishedAt: '2026-08-30T00:01:00Z', horizonMinutes: 60, requiredBikeCount: 1, riskType: 'RENTAL', dataState: 'NORMAL',
  coverage: { activePublicStationCount: 10, analyzedStationCount: 9, analysisNormalCount: 8, profileAvailableCount: 7, eligibleCandidateCount: 2 }, limitations: ['STATION_NUMBER_MISSING'], nextCursor: 'opaque-next',
  globalCoverage: { activePublicStationCount: 10, inventoryEligibleCount: 9, evaluatedCount: 9, normalInferenceCount: 8, inventoryMissingCount: 1, inventoryDelayedCount: 0, inventoryUnavailableCount: 0, inferenceInsufficientCount: 1, unevaluatedCount: 0 },
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
    expect(screen.getByText('서울 전체 데이터 범위')).toBeInTheDocument();
    expect(screen.getByLabelText('데이터 범위')).toHaveTextContent('집중관리 후보 (서울 전체)2');
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
    fireEvent.change(screen.getByLabelText('예측 구간'), { target: { value: '120' } });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, requiredBikeCount: 1, limit: 25 })));
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'opaque-next', horizonMinutes: 120, requiredBikeCount: 1, limit: 25 })));
  });

  test.each([
    [{ items: [], dataState: 'NORMAL' }, '표시할 항목 없음', '정상', 'candidates-root-state--normal'],
    [{ items: [], dataState: 'DELAYED' }, '정보 갱신 지연', '정보 갱신 지연', 'candidates-root-state--delayed'],
    [{ items: [], dataState: 'INSUFFICIENT_DATA' }, '판단에 필요한 정보 부족', '판단 정보 부족', 'candidates-root-state--insufficient-data'],
    [{ items: [], dataState: 'UNAVAILABLE' }, '현재 사용할 수 없음', '현재 사용 불가', 'candidates-root-state--unavailable'],
  ])('renders root %s state distinctly', async (partial, panelLabel, badgeLabel, stateClass) => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, ...partial }))} />);
    expect((await screen.findAllByText(panelLabel)).length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText('목록 기준')).getByText(badgeLabel)).toHaveClass('candidates-root-state', stateClass);
  });

  test('keeps measured inventory gaps in details while showing the usable ranking immediately', async () => {
    const partial = {
      ...first,
      dataState: 'MISSING',
      freshness: { state: 'FRESH' },
      globalCoverage: {
        ...first.globalCoverage,
        activePublicStationCount: 2735,
        evaluatedCount: 2719,
        normalInferenceCount: 2719,
        inventoryMissingCount: 16,
      },
    };
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve(partial))} />);

    expect(await screen.findByRole('table', { name: '집중관리 후보 목록' })).toBeInTheDocument();
    expect(screen.queryByText('일부 데이터 확인 필요')).not.toBeInTheDocument();
    expect(screen.queryByText('서울 전체 2,735곳 중 2,719곳은 정상적으로 평가되었습니다. 최신 재고를 확인할 수 없는 16곳은 이번 후보 산정에서 제외되었습니다.')).not.toBeInTheDocument();
    const context = screen.getByLabelText('목록 기준');
    expect(within(context).getByText('정상 평가')).toHaveClass('candidates-root-state', 'candidates-root-state--normal');
    expect(context).toHaveTextContent('2,719곳 평가 · 16곳 제외');
    expect(within(context).queryByText('MISSING')).not.toBeInTheDocument();
    expect(screen.queryByText('일부 정보만 사용 가능')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('상세 상태 보기'));
    const technicalState = screen.getByLabelText('원본 상태 상세');
    expect(technicalState).toHaveTextContent('원본 데이터 상태일부 데이터 결측');
    expect(technicalState).toHaveTextContent('신선도최신');
  });

  test('does not invent a reassuring normal count when missing coverage is unavailable', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({
      ...first,
      items: [],
      dataState: 'MISSING',
      globalCoverage: { ...first.globalCoverage, activePublicStationCount: null, normalInferenceCount: 0, inventoryMissingCount: null },
    }))} />);

    expect(await screen.findByText('데이터 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('일부 대여소의 최신 재고를 확인할 수 없습니다. 아래 데이터 범위에서 상세 상태를 확인해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText(/정상적으로 평가되었습니다/)).not.toBeInTheDocument();
  });

  test('reports a missing Global result without treating it as an empty ranking', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, items: [], dataState: 'INSUFFICIENT_DATA', limitations: ['GLOBAL_RESULT_NOT_GENERATED'], freshness: { state: 'NOT_GENERATED' } }))} />);
    expect(await screen.findByText('판단에 필요한 정보 부족')).toBeInTheDocument();
    expect(screen.getByText(/서울 전체 위험 결과가 없거나 만료/)).toBeInTheDocument();
    expect(screen.queryByText('현재 조건에서 표시할 집중관리 후보가 없습니다.')).not.toBeInTheDocument();
  });

  test('distinguishes an expired Global result from an actual empty result', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, items: [], dataState: 'INSUFFICIENT_DATA', limitations: ['GLOBAL_RESULT_EXPIRED'], freshness: { state: 'EXPIRED' } }))} />);
    expect(await screen.findByText(/서울 전체 위험 결과가 없거나 만료/)).toBeInTheDocument();
    expect(screen.queryByText('현재 조건에서 표시할 집중관리 후보가 없습니다.')).not.toBeInTheDocument();
  });

  test('uses a neutral root state badge for an unsupported source value', async () => {
    render(<CandidatesPage createAdapter={adapterFor(() => Promise.resolve({ ...first, dataState: 'UNKNOWN_SOURCE_STATE' }))} />);
    const context = await screen.findByLabelText('목록 기준');
    expect(within(context).getByText('확인 필요')).toHaveClass('candidates-root-state', 'candidates-root-state--unknown');
    fireEvent.click(screen.getByText('상세 상태 보기'));
    expect(screen.getByLabelText('원본 상태 상세')).toHaveTextContent('원본 데이터 상태UNKNOWN_SOURCE_STATE');
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

    fireEvent.change(screen.getByLabelText('예측 구간'), { target: { value: '120' } });
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
