import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const DATA_STATE_TO_UI = { DELAYED: 'DELAYED', MISSING: 'PARTIAL', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const COVERAGE_FIELDS = [
  ['activePublicStationCount', '활성 공개 대여소'],
  ['inventoryAvailableCount', '재고 확인 가능'],
  ['predictionAvailableCount', '예측 확인 가능'],
  ['profileAvailableCount', '반복 근거 확인 가능'],
  ['eligibleCandidateCount', '집중관리 후보'],
];

function formatTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '확인 정보 없음'; }
function formatPercent(value) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '확인 정보 없음'; }
function formatBikes(value) { return value === null || value === undefined ? '재고 확인 필요' : `${value}대`; }
function isAccessError(error) { return error?.status === 401 || error?.status === 403; }

function RecurrenceEvidence({ recurrence }) {
  if (!recurrence?.available) return <span className="candidates-recurrence-unavailable">반복 품절 근거 없음{recurrence?.reasonCode ? ` (${recurrence.reasonCode})` : ''}</span>;
  return <details className="candidates-recurrence">
    <summary>반복 품절 근거 · 표본 {recurrence.sampleCount ?? '확인 정보 없음'}건 · 품절 관측 {formatPercent(recurrence.observedStockoutRate)}</summary>
    <dl>
      <div><dt>분석 기간</dt><dd>{recurrence.windowStart || '확인 정보 없음'} ~ {recurrence.windowEnd || '확인 정보 없음'}</dd></div>
      <div><dt>품절 에피소드</dt><dd>{recurrence.episodeCount ?? '확인 정보 없음'}회</dd></div>
      <div><dt>중앙 재고</dt><dd>{formatBikes(recurrence.medianBikeCount)}</dd></div>
      <div><dt>중앙 지속 시간</dt><dd>{recurrence.medianDurationMinutes ?? '확인 정보 없음'}분</dd></div>
      <div><dt>P90 지속 시간</dt><dd>{recurrence.p90DurationMinutes ?? '확인 정보 없음'}분</dd></div>
      <div><dt>3대 회복 중앙 시간</dt><dd>{recurrence.medianRecoveryMinutesToThree ?? '확인 정보 없음'}분</dd></div>
    </dl>
  </details>;
}

export default function CandidatesPage({ createAdapter }) {
  const [horizonMinutes, setHorizonMinutes] = useState(60);
  const [requiredBikeCount, setRequiredBikeCount] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const generation = useRef(0);
  const loadMoreController = useRef(null);
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const limit = 25;

  const resetLoadMore = () => {
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setLoadingMore(false);
    setLoadMoreError(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    resetLoadMore();
    setLoading(true); setError(null); setResult(null);
    adapter.load({ horizonMinutes, requiredBikeCount, limit, signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted && generation.current === current) setResult(next); })
      .catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError' && generation.current === current) setError(nextError); })
      .finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => controller.abort();
  }, [adapter, horizonMinutes, requiredBikeCount]);

  const loadMore = () => {
    if (!result?.nextCursor || loadingMore) return;
    const controller = new AbortController();
    const current = ++generation.current;
    loadMoreController.current = controller;
    setLoadingMore(true); setLoadMoreError(null);
    adapter.load({ horizonMinutes, requiredBikeCount, limit, cursor: result.nextCursor, signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted && generation.current === current) setResult((previous) => ({ ...next, items: [...(previous?.items || []), ...(next.items || [])] }));
      })
      .catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError' && generation.current === current) setLoadMoreError(nextError); })
      .finally(() => { if (loadMoreController.current === controller) { loadMoreController.current = null; setLoadingMore(false); } });
  };

  if (loading) return <AsyncStatePanel state="LOADING" />;
  if (error) return <AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'OPS_CANDIDATE_READ' : undefined} />;

  const items = result?.items || [];
  const rootUiState = DATA_STATE_TO_UI[result?.dataState] || (!items.length ? 'EMPTY' : 'SUCCESS');
  return <main className="candidates-page" aria-label="집중관리 목록">
    <header className="candidates-header">
      <div>
        <p className="candidates-eyebrow">UI-OPS-03</p>
        <h1>집중관리 목록</h1>
        <p>미래 대여 부족 확률과 반복 품절 근거를 기준으로 우선 확인 대여소를 정렬합니다.</p>
      </div>
      <div className="candidates-reference-time">
        <span>기준 시각</span>
        <strong>{formatTime(result?.referenceTime)}</strong>
      </div>
    </header>
    <section className="candidates-decision-context" aria-label="목록 조건 및 기준">
      <div className="candidates-controls">
        <p>조회 조건</p>
        <label>예측 horizon<select value={horizonMinutes} onChange={(event) => { resetLoadMore(); setHorizonMinutes(Number(event.target.value)); }}>{[60, 120, 180, 240].map((value) => <option key={value} value={value}>{value}분</option>)}</select></label>
        <label>필요 자전거 수<select value={requiredBikeCount} onChange={(event) => { resetLoadMore(); setRequiredBikeCount(Number(event.target.value)); }}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}대</option>)}</select></label>
      </div>
      <div className="candidates-context" aria-label="목록 기준">
        <span><b>생성 시각</b>{formatTime(result?.generatedAt)}</span>
        <span><b>데이터 상태</b><mark>{result?.dataState || 'UNAVAILABLE'}</mark></span>
        <span><b>위험 유형</b>{result?.riskType || 'RENTAL'}</span>
      </div>
    </section>
    <section className="candidates-list" aria-labelledby="candidates-heading">
      <div className="candidates-list-heading">
        <div><h2 id="candidates-heading">우선 확인 후보</h2><p>API가 제공한 순서를 그대로 표시합니다.</p></div>
        <nav aria-label="운영 화면 이동"><a href="/admin/ops/risk-map">대여 부족 위험 지도</a><a href="/admin/ops/analysis">반복 품절 패턴</a></nav>
      </div>
      {rootUiState !== 'SUCCESS' ? <div className="candidates-state-panel"><AsyncStatePanel state={rootUiState} code={result?.dataState === 'MISSING' ? 'MISSING' : undefined} /></div> : null}
      {items.length ? <div className="candidates-table-wrap"><table><caption>집중관리 후보 목록</caption><thead><tr><th scope="col">순위</th><th scope="col">대여소</th><th scope="col">대여 부족 확률</th><th scope="col">예상 시점</th><th scope="col">현재 재고</th><th scope="col">후보 데이터 상태</th><th scope="col">반복 품절 근거</th></tr></thead><tbody>{items.map((candidate) => <tr key={`${candidate.rank}-${candidate.station?.stationNumber}`}><td className="candidates-rank"><strong>{candidate.rank}</strong></td><td className="candidates-station"><strong>{candidate.station?.name || '이름 확인 필요'}</strong><small>{candidate.station?.stationNumber || '번호 확인 필요'}</small></td><td className="candidates-probability">{formatPercent(candidate.prediction?.selectedShortageProbability)}</td><td className="candidates-target-time">{formatTime(candidate.prediction?.predictionTargetAt)}</td><td>{formatBikes(candidate.station?.currentBikes)}</td><td><span className="candidates-data-state">{candidate.dataState || '확인 정보 없음'}</span></td><td><RecurrenceEvidence recurrence={candidate.recurrence} /></td></tr>)}</tbody></table></div> : <p className="candidates-empty">현재 조건에서 표시할 집중관리 후보가 없습니다.</p>}
      {result?.nextCursor ? <button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? '추가 항목을 불러오는 중' : '더 보기'}</button> : null}
      {loadMoreError ? <p role="status" className="candidates-load-more-error">추가 항목을 불러오지 못했습니다. <button type="button" onClick={loadMore}>재시도</button></p> : null}
    </section>
    <section className="candidates-coverage" aria-label="데이터 범위"><div className="candidates-coverage-heading"><h2>데이터 범위</h2>{result?.limitations?.length ? <p>제한 사항: {result.limitations.join(', ')}</p> : null}</div><div className="candidates-coverage-values">{COVERAGE_FIELDS.map(([field, label]) => <span key={field}><b>{label}</b>{result?.coverage?.[field] ?? '확인 정보 없음'}</span>)}</div></section>
  </main>;
}
