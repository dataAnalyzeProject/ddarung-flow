import { useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import RiskMapPanel from './RiskMapPanel';

const DATA_STATE_TO_UI = { NORMAL: 'SUCCESS', DELAYED: 'DELAYED', MISSING: 'PARTIAL', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const inventoryLabels = [['normal', 'NORMAL'], ['delayed', 'DELAYED'], ['missing', 'MISSING'], ['unavailable', 'UNAVAILABLE']];

function formatTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '기준시각 없음'; }
function formatNumber(value) { return value === null || value === undefined ? null : Number(value).toLocaleString('ko-KR'); }
function formatCount(value) { const formatted = formatNumber(value); return formatted === null ? '확인 정보 없음' : `${formatted}곳`; }
function isAccessError(error) { return error?.status === 401 || error?.status === 403; }
function operatorDataState(value) {
  return { NORMAL: '정상', DELAYED: '갱신 지연', MISSING: '재고 일부 확인 불가', INSUFFICIENT_DATA: '판단 정보 부족', UNAVAILABLE: '사용 불가' }[value] || '상태 확인 필요';
}
function percent(value) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : '판단 정보 부족'; }
function targetTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '예측 대상 시각 없음'; }
function operatorRiskNotice(state, dataState) {
  const labels = { DELAYED: '정보 갱신 지연', PARTIAL: '일부 데이터 누락', INSUFFICIENT_DATA: '판단 정보 부족', UNAVAILABLE: '현재 사용할 수 없음' };
  return state !== 'SUCCESS' && labels[state] ? `${labels[state]} · ${operatorDataState(dataState)}` : null;
}
function OperatorPriorityStationList({ items, selectedStationNumber, onSelect, state, dataState, horizonMinutes, requiredBikeCount }) {
  const notice = operatorRiskNotice(state, dataState);
  return <section className="ops-dashboard-panel ops-priority-panel" aria-labelledby="priority-title">
    <div className="ops-panel-heading"><div><h2 id="priority-title">대여 부족 확률 상위 5곳</h2><p>서울 전체 정상 평가 대여소 중 {horizonMinutes}분 후 {requiredBikeCount}대 이상을 확보하지 못할 확률이 높은 5곳입니다. 동률은 대여소 번호순입니다.</p>{notice ? <p className="ops-risk-state-notice" role="status">{notice}</p> : null}</div></div>
    <ol className="ops-priority-list">{items.map((item, index) => { const number = item.station.stationNumber; const selected = selectedStationNumber === number; return <li key={number}><button type="button" onClick={() => onSelect(number)} aria-current={selected ? 'true' : undefined} className={selected ? 'selected' : ''}><span className="ops-rank">{index + 1}</span><span className="ops-station"><strong>{item.station.name}</strong><small>{number} · 현재 {item.station.currentBikes ?? '판단 정보 부족'}대 · {operatorDataState(item.dataState)}</small>{item.predictionTargetAt ? <time dateTime={item.predictionTargetAt}>예측 대상 {targetTime(item.predictionTargetAt)}</time> : <small>예측 대상 시각 없음</small>}</span><span className={`ops-band ops-risk-${item.riskBand || 'unknown'}`}>{item.riskBand || '판단 정보 부족'}</span><span className="ops-probability">{percent(item.rentalRisk?.selectedShortageProbability)}</span></button></li>; })}</ol>
  </section>;
}
function primaryState(overview) {
  if (overview?.coverage?.activeStationCount === 0 || overview?.limitations?.includes('NO_ACTIVE_PUBLIC_STATIONS')) return 'EMPTY';
  return DATA_STATE_TO_UI[overview?.dataState] || 'SUCCESS';
}

function riskUiState(risk, riskError) {
  if (riskError) return isAccessError(riskError) ? 'FORBIDDEN' : 'ERROR';
  const hasItems = risk?.items?.length > 0;
  if (risk?.dataState === 'NORMAL') return hasItems ? 'SUCCESS' : 'EMPTY';
  if (risk?.dataState === 'DELAYED') return 'DELAYED';
  if (risk?.dataState === 'MISSING') return 'PARTIAL';
  if (risk?.dataState === 'INSUFFICIENT_DATA') return 'INSUFFICIENT_DATA';
  if (risk?.dataState === 'UNAVAILABLE') return 'UNAVAILABLE';
  return hasItems ? 'SUCCESS' : 'EMPTY';
}

function SectionState({ state, error }) {
  if (state === 'SUCCESS') return null;
  if (state === 'EMPTY') return <p className="ops-section-state">현재 조건에서 표시할 위험 대여소가 없습니다.</p>;
  return <AsyncStatePanel state={state} code={error?.code} requiredPermission={state === 'FORBIDDEN' ? 'OPS_RISK_MAP_READ' : undefined} />;
}

function statusPresentation(overview, coverage) {
  const active = coverage.activePublicStationCount;
  const evaluated = coverage.evaluatedCount;
  const normal = coverage.normalInferenceCount;
  const missing = coverage.inventoryMissingCount;
  const delayed = coverage.inventoryDelayedCount;
  const unavailable = coverage.inventoryUnavailableCount;
  const freshness = overview.freshness?.state;
  const resultUnavailable = !overview.globalResultId || freshness === 'NOT_GENERATED' || freshness === 'EXPIRED' || !evaluated || !normal;

  if (resultUnavailable || overview.dataState === 'INSUFFICIENT_DATA') {
    return { title: '판단 정보 부족', description: '현재 서울 전체 위험을 판단할 수 있는 정상 평가 결과가 없습니다.' };
  }
  if (overview.dataState === 'UNAVAILABLE') {
    return { title: '데이터 사용 불가', description: `정상 평가 ${formatCount(normal)} · 현재 사용할 수 없는 재고 ${formatCount(unavailable)}` };
  }
  if (freshness === 'STALE' || overview.dataState === 'DELAYED') {
    return { title: '데이터 갱신 지연', description: `정상 평가 ${formatCount(normal)} · 갱신이 지연된 재고 ${formatCount(delayed)}` };
  }
  if (overview.dataState === 'MISSING') {
    if (!(missing > 0)) {
      return {
        title: '일부 데이터 확인 필요',
        cardTitle: '일부 데이터 결측',
        description: '원본 상태가 결측으로 보고되었습니다. 상세 상태에서 커버리지 수치를 확인해 주세요.',
        cardDescription: `정상 평가 ${formatCount(normal)} · 결측 수 ${formatCount(missing)}`,
      };
    }
    return {
      title: '일부 데이터 확인 필요',
      cardTitle: '일부 데이터 결측',
      description: `서울 전체 ${formatCount(active)} 중 ${formatCount(normal)}은 정상적으로 평가되었습니다. 최신 재고를 확인할 수 없는 ${formatCount(missing)}은 이번 위험 계산에서 제외되었습니다.`,
      cardDescription: `${formatCount(normal)} 정상 평가 · ${formatCount(missing)} 재고 확인 불가`,
    };
  }
  return { title: '정상', description: `서울 전체 ${formatCount(active)} 중 ${formatCount(normal)}이 정상적으로 평가되었습니다.` };
}

export default function OpsDashboard({ createAdapter }) {
  const [horizonMinutes, setHorizonMinutes] = useState(60);
  const [requiredBikeCount, setRequiredBikeCount] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStationNumber, setSelectedStationNumber] = useState(null);
  const adapter = useMemo(() => createAdapter(), [createAdapter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setResult(null); setSelectedStationNumber(null);
    adapter.load({ horizonMinutes, requiredBikeCount, signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setResult(next); })
      .catch((nextError) => { if (nextError.name !== 'AbortError' && !controller.signal.aborted) setError(nextError); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [adapter, horizonMinutes, requiredBikeCount]);

  if (loading) return <AsyncStatePanel state="LOADING" />;
  if (error) return <AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'OPS_DASHBOARD_READ' : undefined} />;
  const overview = result?.overview;
  const uiState = primaryState(overview);
  const items = result?.risk?.items || [];
  const riskState = riskUiState(result?.risk, result?.riskError);
  const hasRiskItems = items.length > 0;
  const selected = selectedStationNumber || items[0]?.station?.stationNumber;
  const summary = overview.rentalRiskSummary || {};
  const inventory = overview.inventoryStateSummary || {};
  const coverage = overview.globalCoverage || {};
  const status = statusPresentation(overview, coverage);

  return <main className="ops-dashboard" aria-label="운영 상황판">
    <header className="ops-dashboard-header"><div><p className="ops-eyebrow">UI-OPS-01</p><h1>운영 상황판</h1></div><div className="ops-controls"><label>예측 horizon<select value={horizonMinutes} onChange={(event) => setHorizonMinutes(Number(event.target.value))}>{[60, 120, 180, 240].map((value) => <option key={value} value={value}>{value}분</option>)}</select></label><label>필요 자전거 수<select value={requiredBikeCount} onChange={(event) => setRequiredBikeCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></header>
    <section className="ops-context" aria-label="운영 기준"><span><b>기준시각</b>{formatTime(overview.referenceTime)}</span><span><b>예측 horizon</b>{horizonMinutes}분</span><span><b>필요 자전거 수</b>{requiredBikeCount}대</span><span><b>데이터 상태</b><mark>{uiState === 'EMPTY' ? '운영 대상 없음' : status.cardTitle || status.title}</mark></span></section>
    <section className={`ops-status-summary ops-state-${uiState}`} aria-live="polite"><strong>{uiState === 'EMPTY' ? '운영 대상 없음' : status.title}</strong><p>{uiState === 'EMPTY' ? '운영 가능한 공개 대여소가 없습니다.' : status.description}</p></section>
    {result.riskError ? <p className="ops-overall-state ops-state-PARTIAL">일부 정보만 표시합니다. 위험 지도와 Top 5 상태를 확인해 주세요.</p> : null}
    <section className="ops-summary-grid" aria-label="대여 위험 요약"><article><p>CRITICAL 대여 부족</p><strong>{summary.criticalCount ?? '판단 정보 부족'}</strong><small>즉시 확인 필요</small></article><article><p>HIGH 대여 부족</p><strong>{summary.highCount ?? '판단 정보 부족'}</strong><small>우선 대응 권장</small></article><article><p>WATCH 대여 부족</p><strong>{summary.watchCount ?? '판단 정보 부족'}</strong><small>관찰 대상</small></article><article><p>데이터 상태</p><strong>{uiState === 'EMPTY' ? '운영 대상 없음' : status.cardTitle || status.title}</strong><small>{status.cardDescription || `LOW ${summary.lowCount ?? '판단 정보 부족'}`}</small></article></section>
    <details className="ops-technical-status"><summary>상세 상태 보기</summary><div><p>서울 전체 · Global result {overview.globalResultId ? `(${overview.globalResultId})` : '미생성'} · {overview.freshness?.state || 'NOT_GENERATED'} · generation {overview.generationState || 'NOT_GENERATED'} · 기준 {formatTime(overview.referenceTime)} · 발행 {formatTime(overview.publishedAt || overview.generatedAt)}</p><p>Coverage · active {formatCount(coverage.activePublicStationCount)} · eligible {formatCount(coverage.inventoryEligibleCount)} · evaluated {formatCount(coverage.evaluatedCount)} · normal {formatCount(coverage.normalInferenceCount)} · MISSING {formatCount(coverage.inventoryMissingCount)} · DELAYED {formatCount(coverage.inventoryDelayedCount)} · UNAVAILABLE {formatCount(coverage.inventoryUnavailableCount)} · inference insufficient {formatCount(coverage.inferenceInsufficientCount)} · unevaluated {formatCount(coverage.unevaluatedCount)}</p><p>현재 화면 상태: {uiState}{overview.dataState === 'MISSING' ? ' (MISSING)' : ''} · raw dataState {overview.dataState || 'UNAVAILABLE'} · LOW {summary.lowCount ?? '판단 정보 부족'} · {inventoryLabels.map(([key, label]) => `${label} ${inventory[key] ?? '—'}`).join(' · ')}</p></div></details>
    <section className="ops-content-grid">
      <div>{hasRiskItems ? <RiskMapPanel items={items} selectedStationNumber={selected} onSelect={setSelectedStationNumber} referenceTime={result.risk?.referenceTime} state={riskState} dataState={operatorDataState(result.risk?.dataState)} /> : <section className="ops-dashboard-panel"><h2>서울 전체 위험 Top 5 지도</h2>{result.risk || result.riskError ? <SectionState state={riskState} error={result.riskError} /> : <p className="ops-section-state">판단 정보 부족</p>}</section>}</div>
      <div>{hasRiskItems ? <OperatorPriorityStationList items={items} selectedStationNumber={selected} onSelect={setSelectedStationNumber} state={riskState} dataState={result.risk?.dataState} horizonMinutes={horizonMinutes} requiredBikeCount={requiredBikeCount} /> : <section className="ops-dashboard-panel"><h2>대여 부족 확률 상위 5곳</h2>{result.risk || result.riskError ? <SectionState state={riskState} error={result.riskError} /> : <p className="ops-section-state">판단 정보 부족</p>}</section>}</div>
    </section>
    <section className="ops-notices" aria-label="지원 범위와 제한"><h2>지원 범위</h2>{overview.capabilities?.returnRisk?.available === false ? <p>반납 위험은 현재 지원되지 않음{overview.capabilities.returnRisk.reasonCode ? ` (${overview.capabilities.returnRisk.reasonCode})` : ''}</p> : null}{overview.limitations?.length ? <p>제한 사항: {overview.limitations.join(', ')}</p> : null}</section>
  </main>;
}
