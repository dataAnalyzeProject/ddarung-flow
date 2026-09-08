import { useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import RiskMapPanel from './RiskMapPanel';
import PriorityStationList from './PriorityStationList';

const DATA_STATE_TO_UI = { NORMAL: 'SUCCESS', DELAYED: 'DELAYED', MISSING: 'PARTIAL', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const inventoryLabels = [['normal', 'NORMAL'], ['delayed', 'DELAYED'], ['missing', 'MISSING'], ['unavailable', 'UNAVAILABLE']];

function formatTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '기준시각 없음'; }
function formatCount(value) { return value === null || value === undefined ? '확인 정보 없음' : `${value}곳`; }
function isAccessError(error) { return error?.status === 401 || error?.status === 403; }
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

  return <main className="ops-dashboard" aria-label="운영 상황판">
    <header className="ops-dashboard-header"><div><p className="ops-eyebrow">UI-OPS-01</p><h1>운영 상황판</h1></div><div className="ops-controls"><label>예측 horizon<select value={horizonMinutes} onChange={(event) => setHorizonMinutes(Number(event.target.value))}>{[60, 120, 180, 240].map((value) => <option key={value} value={value}>{value}분</option>)}</select></label><label>필요 자전거 수<select value={requiredBikeCount} onChange={(event) => setRequiredBikeCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></header>
    <section className="ops-context" aria-label="운영 기준"><span><b>기준시각</b>{formatTime(overview.referenceTime)}</span><span><b>예측 horizon</b>{horizonMinutes}분</span><span><b>필요 자전거 수</b>{requiredBikeCount}대</span><span><b>데이터 상태</b><mark>{overview.dataState || 'UNAVAILABLE'}</mark></span></section>
    <p className="ops-overall-state">서울 전체 · Global result {overview.globalResultId ? `(${overview.globalResultId})` : '미생성'} · {overview.freshness?.state || 'NOT_GENERATED'} · generation {overview.generationState || 'NOT_GENERATED'} · 발행 {formatTime(overview.publishedAt)}</p>
    <p className="ops-overall-state">Coverage · active {formatCount(coverage.activePublicStationCount)} · eligible {formatCount(coverage.inventoryEligibleCount)} · evaluated {formatCount(coverage.evaluatedCount)} · normal {formatCount(coverage.normalInferenceCount)} · MISSING {formatCount(coverage.inventoryMissingCount)} · DELAYED {formatCount(coverage.inventoryDelayedCount)} · UNAVAILABLE {formatCount(coverage.inventoryUnavailableCount)} · inference insufficient {formatCount(coverage.inferenceInsufficientCount)} · unevaluated {formatCount(coverage.unevaluatedCount)}</p>
    {overview.freshness?.state === 'STALE' ? <p className="ops-overall-state ops-state-DELAYED">마지막 서울 전체 결과가 지연 상태입니다. 기준시각과 발행시각을 확인해 주세요.</p> : null}
    {uiState !== 'SUCCESS' ? <p className={`ops-overall-state ops-state-${uiState}`}>{uiState === 'EMPTY' ? '운영 가능한 공개 대여소가 없습니다.' : `현재 화면 상태: ${uiState}${overview.dataState === 'MISSING' ? ' (MISSING)' : ''}`}</p> : null}
    {overview.limitations?.includes('GLOBAL_RESULT_NOT_GENERATED') ? <p className="ops-overall-state ops-state-PARTIAL">서울 전체 위험 결과가 아직 생성되지 않아 판단 정보가 부족합니다.</p> : null}
    {overview.limitations?.includes('GLOBAL_RESULT_EXPIRED') ? <p className="ops-overall-state ops-state-PARTIAL">서울 전체 위험 결과가 만료되어 현재 위험 건수를 표시하지 않습니다.</p> : null}
    {result.riskError ? <p className="ops-overall-state ops-state-PARTIAL">일부 정보만 표시합니다. 위험 지도와 Top 5 상태를 확인해 주세요.</p> : null}
    <section className="ops-summary-grid" aria-label="대여 위험 요약"><article><p>CRITICAL 대여 부족</p><strong>{summary.criticalCount ?? '판단 정보 부족'}</strong><small>즉시 확인 필요</small></article><article><p>HIGH 대여 부족</p><strong>{summary.highCount ?? '판단 정보 부족'}</strong><small>우선 대응 권장</small></article><article><p>WATCH 대여 부족</p><strong>{summary.watchCount ?? '판단 정보 부족'}</strong><small>관찰 대상</small></article><article><p>데이터 상태</p><strong>{overview.dataState || 'UNAVAILABLE'}</strong><small>{inventoryLabels.map(([key, label]) => `${label} ${inventory[key] ?? '—'}`).join(' · ')}</small></article></section>
    <section className="ops-content-grid">
      <div>{hasRiskItems ? <RiskMapPanel items={items} selectedStationNumber={selected} onSelect={setSelectedStationNumber} referenceTime={result.risk?.referenceTime} state={riskState} dataState={result.risk?.dataState} /> : <section className="ops-dashboard-panel"><h2>서울 전체 위험 Top 5 지도</h2>{result.risk || result.riskError ? <SectionState state={riskState} error={result.riskError} /> : <p className="ops-section-state">판단 정보 부족</p>}</section>}</div>
      <div>{hasRiskItems ? <PriorityStationList items={items} selectedStationNumber={selected} onSelect={setSelectedStationNumber} state={riskState} dataState={result.risk?.dataState} /> : <section className="ops-dashboard-panel"><h2>서울 전체 우선 확인 Top 5</h2>{result.risk || result.riskError ? <SectionState state={riskState} error={result.riskError} /> : <p className="ops-section-state">판단 정보 부족</p>}</section>}</div>
    </section>
    <section className="ops-notices" aria-label="지원 범위와 제한"><h2>지원 범위</h2>{overview.capabilities?.returnRisk?.available === false ? <p>반납 위험은 현재 지원되지 않음{overview.capabilities.returnRisk.reasonCode ? ` (${overview.capabilities.returnRisk.reasonCode})` : ''}</p> : null}{overview.limitations?.length ? <p>제한 사항: {overview.limitations.join(', ')}</p> : null}</section>
  </main>;
}
