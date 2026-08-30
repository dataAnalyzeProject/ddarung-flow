import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const DATA_STATES = { DELAYED: 'DELAYED', MISSING: 'PARTIAL', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const COVERAGE = [
  ['activePublicStationCount', '활성 공개 대여소'], ['profileAvailableCount', '프로필 보유'], ['selectedWindowProfileCount', '선택 창 프로필'],
  ['parsedProfileCount', '파싱 완료'], ['usableCellCount', '사용 가능 셀'], ['expectedCellCount', '예상 셀'],
];

function percent(value) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '표본 부족'; }
function count(value) { return typeof value === 'number' ? value.toLocaleString('ko-KR') : '확인 정보 없음'; }
function time(value) { return value ? new Date(value).toLocaleString('ko-KR') : '확인 정보 없음'; }
function stateForError(error) { return error?.status === 401 || error?.status === 403 ? 'FORBIDDEN' : 'ERROR'; }
function cellLabel(day, hour, cell) { return `${DAYS[day - 1]}요일 ${hour}시 · ${cell?.observedStockoutRate == null ? '표본 부족' : `품절 관측률 ${percent(cell.observedStockoutRate)}`} · 표본 ${count(cell?.sampleCount)}건 · 기여 대여소 ${count(cell?.contributingStationCount)}곳`; }

function Heatmap({ cells }) {
  const indexed = useMemo(() => new Map((cells || []).map((cell) => [`${cell.dayOfWeek}-${cell.hourOfDay}`, cell])), [cells]);
  return <section className="analysis-heatmap" aria-labelledby="analysis-heatmap-heading">
    <div className="analysis-section-heading"><div><h2 id="analysis-heatmap-heading">요일·시간대 품절 관측</h2><p>실제 과거 관측값만 표시하며, 각 셀에 표본과 기여 대여소 수를 함께 표시합니다.</p></div><span>총 168칸</span></div>
    <div className="analysis-heatmap-scroll" tabIndex="0" aria-label="요일과 시간대별 품절 관측 표를 가로로 스크롤"><table><caption>요일과 시간대별 품절 관측률, 표본 수, 기여 대여소 수</caption><thead><tr><th scope="col">요일</th>{Array.from({ length: 24 }, (_, hour) => <th scope="col" key={hour}>{hour}시</th>)}</tr></thead><tbody>{DAYS.map((day, index) => <tr key={day}><th scope="row">{day}</th>{Array.from({ length: 24 }, (_, hour) => { const cell = indexed.get(`${index + 1}-${hour}`); const rate = cell?.observedStockoutRate; const intensity = rate == null ? 'empty' : rate < .34 ? 'low' : rate < .67 ? 'medium' : 'high'; return <td key={hour}><span className={`analysis-heatmap-cell analysis-heatmap-cell--${intensity}`} aria-label={cellLabel(index + 1, hour, cell)}><b>{rate == null ? '—' : `${Math.round(rate * 100)}%`}</b><small>{cell?.sampleCount == null ? '표본 없음' : `${cell.sampleCount}건`}</small><small>{cell?.contributingStationCount == null ? '기여 정보 없음' : `${cell.contributingStationCount}곳`}</small></span></td>; })}</tr>)}</tbody></table></div>
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
  }, [adapter, view]);

  if (loading && !result) return <AsyncStatePanel state="LOADING" />;
  if (error) return <AsyncStatePanel state={stateForError(error)} code={error.code} requiredPermission={stateForError(error) === 'FORBIDDEN' ? 'OPS_ANALYSIS_READ' : undefined} />;

  const uiState = result?.dataState === 'NORMAL' ? 'SUCCESS' : (DATA_STATES[result?.dataState] || 'UNAVAILABLE');
  const showData = result?.dataState !== 'UNAVAILABLE' && (result?.dataState === 'NORMAL' || Object.hasOwn(DATA_STATES, result?.dataState));
  const coverage = result?.coverage || {};
  return <main className="analysis-page" aria-label="반복 품절 패턴">
    <header className="analysis-header"><div><p className="analysis-eyebrow">UI-OPS-04 · OBSERVED_STOCKOUT_RATE</p><h1>반복 품절 패턴</h1><p>미래 예측이 아닌 과거 실제 관측을 요일·시간대별로 확인합니다.</p></div><dl><div><dt>기준 시각</dt><dd>{time(result?.referenceTime)}</dd></div><div><dt>생성 시각</dt><dd>{time(result?.generatedAt)}</dd></div></dl></header>
    <section className="analysis-context" aria-label="분석 조건과 데이터 상태"><div className="analysis-tabs" aria-label="분석 보기"><button type="button" aria-pressed={view === 'WEEKDAY'} onClick={() => setView('WEEKDAY')}>WEEKDAY</button><button type="button" aria-pressed={view === 'HOUR'} onClick={() => setView('HOUR')}>HOUR</button></div><div><b>위험 유형</b><span>{result?.riskType || 'RENTAL'}</span></div><div><b>데이터 상태</b><mark className={`analysis-state analysis-state--${String(result?.dataState || 'unknown').toLowerCase()}`}>{result?.dataState || 'UNAVAILABLE'}</mark></div><div><b>규칙</b><span>{result?.ruleVersion || '확인 정보 없음'}</span></div>{loading ? <p className="analysis-refreshing" role="status">선택한 보기를 불러오는 중입니다.</p> : null}</section>
    {uiState !== 'SUCCESS' ? <AsyncStatePanel state={uiState} code={result?.dataState === 'MISSING' ? 'MISSING' : undefined} /> : null}
    {showData ? <><section className="analysis-window" aria-labelledby="analysis-window-heading"><div><h2 id="analysis-window-heading">선택된 관측 창</h2><p>{result?.selectedWindowStart && result?.selectedWindowEnd ? `${result.selectedWindowStart} ~ ${result.selectedWindowEnd}` : '선택할 수 있는 관측 창이 없습니다.'}</p></div><dl><div><dt>선택 프로필</dt><dd>{count(result?.selectedWindowProfileCount)}개</dd></div><div><dt>제외된 다른 창</dt><dd>{count(result?.excludedDifferentWindowProfileCount)}개</dd></div><div><dt>지표</dt><dd>{result?.metric || '확인 정보 없음'}</dd></div></dl></section>
    <section className="analysis-coverage" aria-labelledby="analysis-coverage-heading"><div className="analysis-section-heading"><div><h2 id="analysis-coverage-heading">커버리지</h2><p>표본과 사용 가능 범위를 함께 확인합니다.</p></div><div className="analysis-rates"><span>프로필 {percent(coverage.profileCoverageRate)}</span><span>셀 {percent(coverage.cellCoverageRate)}</span></div></div><div className="analysis-coverage-grid">{COVERAGE.map(([key, label]) => <div key={key}><b>{label}</b><span>{count(coverage[key])}</span></div>)}</div></section>
    <Buckets result={result || { view, buckets: [] }} />
    <Heatmap cells={result?.weekdayHourCells} />
    {result?.limitations?.length ? <p className="analysis-limitations">제한 사항: {result.limitations.join(', ')}</p> : null}</> : null}
  </main>;
}
