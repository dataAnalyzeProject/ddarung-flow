import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const DATA_STATE_TO_UI = { DELAYED: 'DELAYED', MISSING: 'PARTIAL', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const ROOT_DATA_STATE_CLASS = {
  NORMAL: 'candidates-root-state--normal',
  MISSING: 'candidates-root-state--missing',
  DELAYED: 'candidates-root-state--delayed',
  INSUFFICIENT_DATA: 'candidates-root-state--insufficient-data',
  UNAVAILABLE: 'candidates-root-state--unavailable',
};
const ROOT_DATA_STATE_LABEL = {
  NORMAL: '정상',
  MISSING: '일부 데이터 결측',
  DELAYED: '정보 갱신 지연',
  INSUFFICIENT_DATA: '판단 정보 부족',
  UNAVAILABLE: '현재 사용 불가',
};
const FRESHNESS_STATE_LABEL = {
  FRESH: '최신',
  STALE: '오래됨',
  EXPIRED: '만료됨',
  NOT_GENERATED: '생성되지 않음',
};
const COVERAGE_FIELDS = [
  ['activePublicStationCount', '활성 공개 대여소 (전체)'],
  ['inventoryEligibleCount', '재고 적격 대여소 (서울 전체)'],
  ['evaluatedCount', '평가 완료 대여소 (서울 전체)'],
  ['normalInferenceCount', '정상 추론 (서울 전체)'],
  ['inventoryMissingCount', '재고 MISSING'],
  ['inventoryDelayedCount', '재고 DELAYED'],
  ['inventoryUnavailableCount', '재고 UNAVAILABLE'],
  ['inferenceInsufficientCount', '추론 정보 부족'],
  ['unevaluatedCount', '미평가'],
  ['eligibleCandidateCount', '집중관리 후보 (서울 전체)'],
];

function formatTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '확인 정보 없음'; }
function formatCount(value) { return typeof value === 'number' ? value.toLocaleString('ko-KR') : '확인 정보 없음'; }
function formatPercent(value) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '확인 정보 없음'; }
function formatBikes(value) { return value === null || value === undefined ? '재고 확인 필요' : `${value}대`; }
function coverageValue(result, globalCoverage, field) { return field === 'eligibleCandidateCount' ? result?.coverage?.eligibleCandidateCount : globalCoverage[field]; }
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
  const [selectedStationNumber, setSelectedStationNumber] = useState(null);
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
  const rootDataState = result?.dataState || 'UNAVAILABLE';
  const rootUiState = DATA_STATE_TO_UI[result?.dataState] || (!items.length ? 'EMPTY' : 'SUCCESS');
  const unavailableGlobal = result?.limitations?.some((code) => code === 'GLOBAL_RESULT_NOT_GENERATED' || code === 'GLOBAL_RESULT_EXPIRED');
  const globalCoverage = result?.globalCoverage || {};
  const activeStationCount = globalCoverage.activePublicStationCount;
  const normalInferenceCount = globalCoverage.normalInferenceCount;
  const inventoryMissingCount = globalCoverage.inventoryMissingCount;
  const hasMeasuredInventoryGap = rootDataState === 'MISSING'
    && typeof activeStationCount === 'number' && activeStationCount > 0
    && typeof normalInferenceCount === 'number' && normalInferenceCount > 0
    && typeof inventoryMissingCount === 'number' && inventoryMissingCount > 0;
  const hasUsableMeasuredRanking = hasMeasuredInventoryGap && items.length > 0;
  const selectedCandidate = items.find((candidate) => candidate.station?.stationNumber === selectedStationNumber) || items[0] || null;
  return <main className="candidates-page" aria-label="집중관리 목록">
    <header className="candidates-header">
      <div>
        <p className="candidates-eyebrow">UI-OPS-03</p>
        <h1>집중관리 목록</h1>
        <p>서울 전체 결과의 미래 대여 부족 확률을 기준으로 우선 확인 대여소를 정렬합니다.</p>
      </div>
      <div className="candidates-reference-time">
        <span>기준 시각</span>
        <strong>{formatTime(result?.referenceTime)}</strong>
      </div>
    </header>
    <section className="candidates-decision-context" aria-label="목록 조건 및 기준">
      <div className="candidates-controls">
        <p>조회 조건</p>
        <label>예측 구간<select value={horizonMinutes} onChange={(event) => { resetLoadMore(); setHorizonMinutes(Number(event.target.value)); }}>{[60, 120, 180, 240].map((value) => <option key={value} value={value}>{value}분</option>)}</select></label>
        <label>필요 자전거 수<select value={requiredBikeCount} onChange={(event) => { resetLoadMore(); setRequiredBikeCount(Number(event.target.value)); }}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}대</option>)}</select></label>
      </div>
      <div className="candidates-context" aria-label="목록 기준">
        <span><b>발행 시각</b>{formatTime(result?.publishedAt)}</span>
        <span><b>범위</b>서울 전체 · {result?.scope?.type || 'GLOBAL'}</span>
        <span><b>데이터 상태</b><mark className={`candidates-root-state ${hasUsableMeasuredRanking ? ROOT_DATA_STATE_CLASS.NORMAL : (ROOT_DATA_STATE_CLASS[rootDataState] || 'candidates-root-state--unknown')}`}>{hasUsableMeasuredRanking ? '정상 평가' : (ROOT_DATA_STATE_LABEL[rootDataState] || '확인 필요')}</mark>{hasMeasuredInventoryGap ? <small className="candidates-context-summary">{hasUsableMeasuredRanking ? `${formatCount(normalInferenceCount)}곳 평가 · ${formatCount(inventoryMissingCount)}곳 제외` : `${formatCount(normalInferenceCount)}곳 정상 평가 · ${formatCount(inventoryMissingCount)}곳 재고 확인 불가`}</small> : null}</span>
        <span><b>위험 유형</b>{result?.riskType || 'RENTAL'}</span>
      </div>
    </section>
    <div className="candidates-workspace">
    <section className="candidates-list" aria-labelledby="candidates-heading">
      <div className="candidates-list-heading">
        <div><h2 id="candidates-heading">우선 확인 후보</h2><p>서버가 내려준 순서를 그대로 표시합니다.</p></div>
        <nav aria-label="운영 화면 이동"><a href="/admin/ops/risk-map">대여 부족 위험 지도</a><a href="/admin/ops/analysis">반복 품절 패턴</a></nav>
      </div>
      {rootUiState !== 'SUCCESS' && !hasUsableMeasuredRanking ? <div className="candidates-state-panel">
        {rootDataState === 'MISSING' ? <section className="candidates-partial-summary" role="status" aria-label="부분 결측 안내">
          <strong>{hasMeasuredInventoryGap ? '일부 데이터 확인 필요' : '데이터 확인 필요'}</strong>
          <p>{hasMeasuredInventoryGap
            ? `서울 전체 ${formatCount(activeStationCount)}곳 중 ${formatCount(normalInferenceCount)}곳은 정상적으로 평가되었습니다. 최신 재고를 확인할 수 없는 ${formatCount(inventoryMissingCount)}곳은 이번 후보 산정에서 제외되었습니다.`
            : '일부 대여소의 최신 재고를 확인할 수 없습니다. 아래 데이터 범위에서 상세 상태를 확인해 주세요.'}</p>
        </section> : <AsyncStatePanel state={rootUiState} code={unavailableGlobal ? 'GLOBAL_RESULT_UNAVAILABLE' : undefined} />}
        {unavailableGlobal ? <p className="candidates-scope-guidance">서울 전체 위험 결과가 없거나 만료되어 현재 ranking을 표시하지 않습니다.</p> : null}
      </div> : null}
      {items.length ? <div className="candidates-table-wrap"><table><caption>집중관리 후보 목록</caption><thead><tr><th scope="col">순위</th><th scope="col">대여소</th><th scope="col">대여 부족 확률</th><th scope="col">예상 시점</th><th scope="col">현재 재고</th><th scope="col">후보 데이터 상태</th><th scope="col">반복 품절 근거</th></tr></thead><tbody>{items.map((candidate) => { const selected = candidate.station?.stationNumber === selectedCandidate?.station?.stationNumber; return <tr key={`${candidate.rank}-${candidate.station?.stationNumber}`} className={selected ? 'is-selected' : undefined}><td className="candidates-rank"><strong>{candidate.rank}</strong></td><td className="candidates-station"><button type="button" onClick={() => setSelectedStationNumber(candidate.station?.stationNumber)} aria-pressed={selected}><strong>{candidate.station?.name || '이름 확인 필요'}</strong><small>{candidate.station?.stationNumber || '번호 확인 필요'}</small></button></td><td className="candidates-probability">{formatPercent(candidate.prediction?.selectedShortageProbability)}</td><td className="candidates-target-time">{formatTime(candidate.prediction?.predictionTargetAt)}</td><td>{formatBikes(candidate.station?.currentBikes)}</td><td><span className="candidates-data-state">{candidate.dataState || '확인 정보 없음'}</span></td><td><RecurrenceEvidence recurrence={candidate.recurrence} /></td></tr>; })}</tbody></table></div> : rootUiState === 'SUCCESS' ? <p className="candidates-empty">현재 조건에서 표시할 집중관리 후보가 없습니다.</p> : null}
      {result?.nextCursor ? <button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? '추가 항목을 불러오는 중' : '더 보기'}</button> : null}
      {loadMoreError ? <p role="status" className="candidates-load-more-error">추가 항목을 불러오지 못했습니다. <button type="button" onClick={loadMore}>재시도</button></p> : null}
    </section>
    {selectedCandidate ? <aside className="candidates-detail" aria-label="선택된 후보 상세"><div><p className="candidates-detail-kicker">선택된 후보 상세</p><h2>선택된 후보: {selectedCandidate.station?.name || '이름 확인 필요'}</h2><span className="candidates-station-number">{selectedCandidate.station?.stationNumber || '번호 확인 필요'}</span></div><dl><div><dt>현재 재고</dt><dd>{formatBikes(selectedCandidate.station?.currentBikes)}</dd></div><div><dt>예측 목표 시각</dt><dd>{formatTime(selectedCandidate.prediction?.predictionTargetAt)}</dd></div><div><dt>대여 부족 확률</dt><dd className="candidates-detail-probability">{formatPercent(selectedCandidate.prediction?.selectedShortageProbability)}</dd></div><div><dt>데이터 상태</dt><dd><span className="candidates-data-state">{selectedCandidate.dataState || '확인 정보 없음'}</span></dd></div></dl><a className="candidates-map-link" href="/admin/ops/risk-map">수급 위험 지도에서 보기</a></aside> : null}
    </div>
    <section className="candidates-coverage" aria-label="데이터 범위"><div className="candidates-coverage-heading"><h2>서울 전체 데이터 범위</h2></div><details className="candidates-technical-state"><summary>상세 상태 보기</summary><div aria-label="원본 상태 상세"><span><b>원본 데이터 상태</b>{ROOT_DATA_STATE_LABEL[rootDataState] || rootDataState}</span><span><b>신선도</b>{FRESHNESS_STATE_LABEL[result?.freshness?.state] || result?.freshness?.state || FRESHNESS_STATE_LABEL.NOT_GENERATED}</span><span><b>발행 시각</b>{formatTime(result?.publishedAt)}</span>{result?.limitations?.length ? <span><b>원본 제한 사항</b>{result.limitations.join(', ')}</span> : null}</div></details><div className="candidates-coverage-values">{COVERAGE_FIELDS.map(([field, label]) => <span key={field}><b>{label}</b>{formatCount(coverageValue(result, globalCoverage, field))}</span>)}</div></section>
  </main>;
}
