import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const DATA_STATES = { EMPTY: 'EMPTY', DELAYED: 'DELAYED', MISSING: 'EMPTY', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const COVERAGE = [
  ['activePublicStationCount', '활성 공개 대여소'], ['profileAvailableCount', '프로필 보유'], ['selectedWindowProfileCount', '선택 창 프로필'],
  ['parsedProfileCount', '파싱 완료'], ['usableCellCount', '사용 가능 셀'], ['expectedCellCount', '예상 셀'],
];

function percent(value) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '표본 부족'; }
function count(value) { return typeof value === 'number' ? value.toLocaleString('ko-KR') : '확인 정보 없음'; }
function time(value) { return value ? new Date(value).toLocaleString('ko-KR') : '확인 정보 없음'; }
function stateForError(error) { return error?.status === 401 || error?.status === 403 ? 'FORBIDDEN' : 'ERROR'; }
function cellLabel(day, hour, cell) { return `${DAYS[day - 1]}요일 ${hour}시 · ${cell?.observedStockoutRate == null ? '표본 부족' : `품절 관측률 ${percent(cell.observedStockoutRate)}`} · 표본 ${count(cell?.sampleCount)}건 · 기여 대여소 ${count(cell?.contributingStationCount)}곳`; }
function heatmapStyle(rate) {
  if (rate == null) return undefined;
  return { '--heatmap-intensity': Math.min(1, Math.max(0, rate)) };
}

function DataStatePanel({ dataState }) {
  if (dataState === 'MISSING') return <section className="analysis-data-state" aria-live="polite" aria-label="관측 데이터 누락 상태"><strong>관측 데이터가 누락되었습니다.</strong><p>MISSING · 관측 근거가 없어 분석 차트를 표시하지 않습니다.</p></section>;
  return <AsyncStatePanel state={DATA_STATES[dataState] || 'UNAVAILABLE'} code={dataState === 'EMPTY' ? 'EMPTY' : undefined} />;
}

function RequestErrorPanel({ error, onRetry }) {
  const state = stateForError(error);
  const retryable = state !== 'FORBIDDEN';
  return <div className="analysis-request-state"><AsyncStatePanel state={state} code={error?.code} requiredPermission={state === 'FORBIDDEN' ? 'OPS_ANALYSIS_READ' : undefined} />{retryable ? <button type="button" className="analysis-retry" onClick={onRetry}>다시 시도</button> : null}</div>;
}

function Heatmap({ cells }) {
  const indexed = useMemo(() => new Map((cells || []).map((cell) => [`${cell.dayOfWeek}-${cell.hourOfDay}`, cell])), [cells]);
  const [selectedKey, setSelectedKey] = useState(null);
  const firstObservedCell = (cells || []).find((cell) => cell?.observedStockoutRate != null);
  const selectedCell = indexed.get(selectedKey) || firstObservedCell;
  return <section className="analysis-heatmap" aria-labelledby="analysis-heatmap-heading">
    <div className="analysis-section-heading"><div><h2 id="analysis-heatmap-heading">요일 × 시간대 168 cells</h2><p>색의 진하기는 실제 품절 관측률 연속값이며, 수치·표본·기여 대여소 정보도 함께 제공합니다.</p></div><span className="analysis-cell-count">168 cells</span></div>
    <div className="analysis-heatmap-scroll" tabIndex="0" aria-label="요일과 시간대별 품절 관측 표를 가로로 스크롤"><table><caption>요일과 시간대별 품절 관측률, 표본 수, 기여 대여소 수</caption><thead><tr><th scope="col">요일</th>{Array.from({ length: 24 }, (_, hour) => <th scope="col" key={hour}>{hour}시</th>)}</tr></thead><tbody>{DAYS.map((day, index) => <tr key={day}><th scope="row">{day}</th>{Array.from({ length: 24 }, (_, hour) => { const cell = indexed.get(`${index + 1}-${hour}`); const rate = cell?.observedStockoutRate; const key = `${index + 1}-${hour}`; return <td key={hour}><button type="button" className={`analysis-heatmap-cell${rate == null ? ' analysis-heatmap-cell--empty' : ''}`} style={heatmapStyle(rate)} aria-label={cellLabel(index + 1, hour, cell)} aria-pressed={key === selectedKey || (!selectedKey && cell === firstObservedCell)} onClick={() => setSelectedKey(key)}><b>{rate == null ? '—' : `${Math.round(rate * 100)}%`}</b><small>{cell?.sampleCount == null ? '표본 없음' : `${cell.sampleCount}건`}</small><small>{cell?.contributingStationCount == null ? '기여 정보 없음' : `${cell.contributingStationCount}곳`}</small></button></td>; })}</tr>)}</tbody></table></div>
    {selectedCell ? <div className="analysis-heatmap-detail"><b>선택 {DAYS[selectedCell.dayOfWeek - 1]}요일 {selectedCell.hourOfDay}시</b><span>품절 관측률 {percent(selectedCell.observedStockoutRate)}</span><span>sampleCount {count(selectedCell.sampleCount)}</span><span>contributingStationCount {count(selectedCell.contributingStationCount)}</span></div> : <p className="analysis-heatmap-detail">선택할 관측 정보가 없습니다.</p>}
    <p className="analysis-heatmap-note">빈 칸은 0%가 아니라 관측 정보가 없는 상태입니다.</p>
  </section>;
}

function Buckets({ result }) {
  const hourly = result.view === 'HOUR';
  return <section className="analysis-buckets" aria-labelledby="analysis-buckets-heading"><div className="analysis-section-heading"><div><h2 id="analysis-buckets-heading">{hourly ? '시간대별' : '요일별'} 관측 요약</h2><p>{hourly ? '시간대별로 합산한 과거 품절 관측률입니다.' : '요일별로 합산한 과거 품절 관측률입니다.'}</p></div></div><div className="analysis-bucket-grid">{(result.buckets || []).map((bucket) => <article key={bucket.key} className="analysis-bucket"><span>{hourly ? `${bucket.key}시` : `${DAYS[bucket.key - 1]}요일`}</span><strong>{percent(bucket.observedStockoutRate)}</strong><small>표본 {count(bucket.sampleCount)}건 · 기여 {count(bucket.contributingStationCount)}곳</small><i aria-hidden="true" style={bucket.observedStockoutRate == null ? undefined : { width: `${Math.max(4, bucket.observedStockoutRate * 100)}%` }} /></article>)}</div></section>;
}

export default function AnalysisPage({ createAdapter }) {
  const [view, setView] = useState('WEEKDAY');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const generation = useRef(0);
  const adapter = useMemo(() => createAdapter(), [createAdapter]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true); setError(null);
    adapter.load({ view, signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted && generation.current === current) setResult(next);
    }).catch((nextError) => {
      if (!controller.signal.aborted && nextError?.name !== 'AbortError' && generation.current === current) setError(nextError);
    }).finally(() => {
      if (!controller.signal.aborted && generation.current === current) setLoading(false);
    });
    return () => controller.abort();
  }, [adapter, view, retryVersion]);

  if (loading && !result) return <AsyncStatePanel state="LOADING" />;

  const uiState = result?.dataState === 'NORMAL' ? 'SUCCESS' : (DATA_STATES[result?.dataState] || 'UNAVAILABLE');
  const hasRequestedResult = result?.view === view;
  const showData = !error && hasRequestedResult && ['NORMAL', 'DELAYED', 'INSUFFICIENT_DATA'].includes(result?.dataState);
  const waitingForView = loading && !hasRequestedResult;
  const coverage = result?.coverage || {};
  return <main className="analysis-page" aria-label="반복 품절 패턴">
    <header className="analysis-header"><div><p className="analysis-eyebrow">UI-OPS-04 · OBSERVED_STOCKOUT_RATE</p><h1>반복 품절 패턴</h1><p>미래 예측이 아닌 과거 실제 관측을 요일·시간대별로 확인합니다.</p></div><dl><div><dt>기준 시각</dt><dd>{time(result?.referenceTime)}</dd></div><div><dt>생성 시각</dt><dd>{time(result?.generatedAt)}</dd></div></dl></header>
    <section className="analysis-context" aria-label="분석 조건과 데이터 상태"><div className="analysis-tabs" aria-label="분석 보기"><button type="button" aria-pressed={view === 'WEEKDAY'} onClick={() => setView('WEEKDAY')}>요일별</button><button type="button" aria-pressed={view === 'HOUR'} onClick={() => setView('HOUR')}>시간대별</button></div><div><b>risk type</b><span>{result?.riskType || '확인 정보 없음'}</span></div>{loading ? <p className="analysis-refreshing" role="status">선택한 보기를 불러오는 중입니다.</p> : null}</section>
    {waitingForView ? <AsyncStatePanel state="LOADING" /> : error ? <RequestErrorPanel error={error} onRetry={() => setRetryVersion((version) => version + 1)} /> : <>{uiState !== 'SUCCESS' ? <DataStatePanel dataState={result?.dataState} /> : null}
    {showData ? <><section className="analysis-meta-grid" aria-label="관측 창과 분석 근거"><div><b>선택된 관측 창</b><strong>{result?.selectedWindowStart && result?.selectedWindowEnd ? `${result.selectedWindowStart} ~ ${result.selectedWindowEnd}` : '확인 정보 없음'}</strong></div><div><b>data state</b><mark className={`analysis-state analysis-state--${String(result?.dataState || 'unknown').toLowerCase()}`}>{result?.dataState || 'UNAVAILABLE'}</mark></div><div><b>metric</b><strong>{result?.metric || '확인 정보 없음'}</strong></div><div><b>rule version</b><strong>{result?.ruleVersion || '확인 정보 없음'}</strong></div><div><b>window rule version</b><strong>{result?.windowRuleVersion || '확인 정보 없음'}</strong></div></section>
    <section className="analysis-coverage" aria-labelledby="analysis-coverage-heading"><div><h2 id="analysis-coverage-heading">커버리지</h2><p>표본과 사용 가능 범위</p></div><div className="analysis-coverage-grid">{COVERAGE.map(([key, label]) => <div key={key}><b>{label}</b><span>{count(coverage[key])}</span></div>)}</div><div className="analysis-rates"><span>프로필 {percent(coverage.profileCoverageRate)}</span><span>셀 {percent(coverage.cellCoverageRate)}</span></div></section>
    <div className="analysis-main-grid"><Buckets result={result || { view, buckets: [] }} /><Heatmap cells={result?.weekdayHourCells} /></div>
    <section className="analysis-evidence" aria-labelledby="analysis-evidence-heading"><h2 id="analysis-evidence-heading">해석 및 데이터 의미</h2><dl><div><dt>metric</dt><dd>{result?.metric || '확인 정보 없음'}</dd></div><div><dt>dimensions</dt><dd>WEEKDAY/HOUR · weekdayHourCells 168 cells</dd></div><div><dt>관측 창</dt><dd>선택 프로필 {count(result?.selectedWindowProfileCount)}개 · 다른 창 제외 {count(result?.excludedDifferentWindowProfileCount)}개</dd></div><div><dt>제한 사항</dt><dd>{result?.limitations?.length ? result.limitations.join(', ') : '확인 정보 없음'}</dd></div></dl></section></> : null}</>}
  </main>;
}
