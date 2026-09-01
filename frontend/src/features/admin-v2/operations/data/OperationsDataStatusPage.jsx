import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const LIMITATION_COPY = {
  AFFECTED_SCOPE_NOT_SOURCE_BACKED: '영향 범위는 원본 데이터로 제공되지 않습니다.',
  LAST_NORMAL_REFRESH_NOT_SOURCE_BACKED: '직전 정상 갱신 시각은 보존된 원본 정보가 아닙니다.',
  REASON_LEDGER_NOT_SOURCE_BACKED: '원인·사유 이력은 원본 데이터로 제공되지 않습니다.',
};
const INVENTORY_STATUSES = ['NORMAL', 'DELAYED', 'MISSING', 'UNAVAILABLE'];

function count(value) { return typeof value === 'number' ? value.toLocaleString('ko-KR') : '확인 정보 없음'; }
function ratio(value) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '확인 정보 없음'; }
function time(value) {
  if (!value) return '확인 정보 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '확인 정보 없음' : date.toLocaleString('ko-KR');
}
function requestState(error) { return error?.status === 401 || error?.status === 403 ? 'FORBIDDEN' : 'ERROR'; }
function State({ value }) { return <mark className={`operations-data-state operations-data-state--${String(value || 'unknown').toLowerCase()}`}>{value || '확인 정보 없음'}</mark>; }
function Metric({ label, children }) { return <div className="operations-data-metric"><dt>{label}</dt><dd>{children}</dd></div>; }

function Inventory({ inventory }) {
  const breakdown = inventory?.inventoryStatusBreakdown;
  const sourceBreakdown = Object.entries(breakdown || {}).filter(([state]) => INVENTORY_STATUSES.includes(state));
  return <section className="operations-data-section operations-data-section--inventory" aria-labelledby="operations-data-inventory-heading">
    <div className="operations-data-section-heading"><div><h2 id="operations-data-inventory-heading">현재 재고 데이터</h2><p>현재 운영 위험 판단의 기준이 되는 재고 수집 상태입니다.</p></div><State value={inventory?.dataState} /></div>
    <dl className="operations-data-metrics">
      <Metric label="기대 대여소 수">{count(inventory?.expectedStationCount)}</Metric><Metric label="최신 대여소 수">{count(inventory?.latestStationCount)}</Metric><Metric label="누락 대여소 수">{count(inventory?.missingStationCount)}</Metric>
      <Metric label="최신 수집 시각">{time(inventory?.latestCollectedAt)}</Metric><Metric label="P50 지연">{inventory?.p50DelayMinutes == null ? '확인 정보 없음' : `${count(inventory.p50DelayMinutes)}분`}</Metric><Metric label="P95 지연">{inventory?.p95DelayMinutes == null ? '확인 정보 없음' : `${count(inventory.p95DelayMinutes)}분`}</Metric>
    </dl>
    <section className="operations-data-breakdown" aria-labelledby="operations-data-breakdown-heading"><h3 id="operations-data-breakdown-heading">재고 상태 분포</h3>
      {sourceBreakdown.length ? <table><caption>원본 재고 상태별 대여소 수</caption><thead><tr><th scope="col">상태</th><th scope="col">대여소 수</th></tr></thead><tbody>{sourceBreakdown.map(([state, value]) => <tr key={state}><th scope="row">{state}</th><td>{count(value)}</td></tr>)}</tbody></table> : <p>확인 정보 없음</p>}
    </section>
  </section>;
}

function Prediction({ prediction }) {
  return <section className="operations-data-section" aria-labelledby="operations-data-prediction-heading"><div className="operations-data-section-heading"><div><h2 id="operations-data-prediction-heading">예측 데이터</h2><p>현재 시점에 유효한 예측 배치의 범위만 표시합니다.</p></div>{prediction ? <State value={prediction.dataState} /> : null}</div>
    {!prediction ? <p className="operations-data-absence">유효한 예측 배치 없음</p> : <dl className="operations-data-metrics"><Metric label="feature as-of">{time(prediction.featureAsOf)}</Metric><Metric label="생성 시각">{time(prediction.generatedAt)}</Metric><Metric label="게시 시각">{time(prediction.publishedAt)}</Metric><Metric label="만료 시각">{time(prediction.expiresAt)}</Metric><Metric label="예측 대여소 수">{count(prediction.predictedStationCount)}</Metric><Metric label="예측 행 수">{count(prediction.predictionRowCount)}</Metric><Metric label="커버리지">{ratio(prediction.coverageRatio)}</Metric></dl>}
  </section>;
}

function Profile({ profile }) {
  return <section className="operations-data-section" aria-labelledby="operations-data-profile-heading"><div className="operations-data-section-heading"><div><h2 id="operations-data-profile-heading">패턴/profile 데이터</h2><p>저장된 profile의 범위와 생성 시각을 사실 그대로 표시합니다.</p></div><State value={profile?.dataState} /></div><dl className="operations-data-metrics"><Metric label="활성 공개 대여소 수">{count(profile?.activePublicStationCount)}</Metric><Metric label="profile 보유 대여소 수">{count(profile?.profileAvailableStationCount)}</Metric><Metric label="커버리지">{ratio(profile?.coverageRatio)}</Metric><Metric label="최신 생성 시각">{time(profile?.latestGeneratedAt)}</Metric></dl></section>;
}

function Limitations({ limitations }) {
  const sourceLimitations = (limitations || []).filter((code) => LIMITATION_COPY[code]);
  return <section className="operations-data-section operations-data-limitations" aria-labelledby="operations-data-limitations-heading"><div className="operations-data-section-heading"><div><h2 id="operations-data-limitations-heading">제공하지 않는 정보</h2><p>아래 항목은 현재 원본 계약에 포함되지 않습니다.</p></div></div><ul>{sourceLimitations.map((code) => <li key={code}><strong>{code}</strong><span>{LIMITATION_COPY[code]}</span></li>)}</ul></section>;
}

function RequestError({ error, onRetry }) {
  const forbidden = requestState(error) === 'FORBIDDEN';
  return <div className="operations-data-request-error"><AsyncStatePanel state={forbidden ? 'FORBIDDEN' : 'ERROR'} code={error?.code} requiredPermission={forbidden ? 'DATA_STATUS_READ' : undefined} />{!forbidden ? <button type="button" onClick={onRetry}>다시 시도</button> : null}</div>;
}

function StatusLegend() {
  return <section className="operations-data-legend" aria-label="데이터 상태 범례">
    <div className="operations-data-legend-item operations-data-legend-item--normal"><span>정상 상태</span><strong>정상</strong></div>
    <div className="operations-data-legend-item operations-data-legend-item--delayed"><span>지연 상태</span><strong>지연</strong></div>
    <div className="operations-data-legend-item operations-data-legend-item--missing"><span>결측 상태</span><strong>결측</strong></div>
    <div className="operations-data-legend-item operations-data-legend-item--unavailable"><span>사용 불가 상태</span><strong>사용 불가</strong></div>
  </section>;
}

function SourceSummary({ result }) {
  const rows = [
    ['대여소 재고', result?.inventory?.latestCollectedAt, result?.inventory?.dataState, result?.inventory?.expectedStationCount == null ? '확인 정보 없음' : `기대 대여소 ${count(result.inventory.expectedStationCount)}곳`],
    ['예측 배치', result?.prediction?.publishedAt, result?.prediction?.dataState, result?.prediction ? `커버리지 ${ratio(result.prediction.coverageRatio)}` : '현재 예측 배치 없음'],
    ['패턴/profile', result?.profile?.latestGeneratedAt, result?.profile?.dataState, result?.profile?.profileAvailableStationCount == null ? '확인 정보 없음' : `profile 보유 ${count(result.profile.profileAvailableStationCount)}곳`],
  ];
  return <section className="operations-data-source-summary" aria-labelledby="operations-data-source-summary-heading"><h2 id="operations-data-source-summary-heading">데이터 소스 상태</h2><table><caption>운영 판단에 쓰는 데이터 소스별 최신 시각과 상태</caption><thead><tr><th scope="col">데이터 소스</th><th scope="col">최신 수집 시각</th><th scope="col">상태</th><th scope="col">커버리지 / 비고</th></tr></thead><tbody>{rows.map(([name, collectedAt, state, note]) => <tr key={name}><th scope="row">{name}</th><td>{time(collectedAt)}</td><td><State value={state} /></td><td>{note}</td></tr>)}</tbody></table></section>;
}

export default function OperationsDataStatusPage({ createAdapter }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const retry = useCallback(() => { if (!inFlight.current) setRequestVersion((version) => version + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    inFlight.current = true;
    setLoading(true); setError(null); setResult(null);
    adapter.load({ signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted && generation.current === current) setResult(next);
    }).catch((nextError) => {
      if (!controller.signal.aborted && nextError?.name !== 'AbortError' && generation.current === current) setError(nextError);
    }).finally(() => {
      if (!controller.signal.aborted && generation.current === current) { inFlight.current = false; setLoading(false); }
    });
    return () => controller.abort();
  }, [adapter, requestVersion]);

  if (loading) return <AsyncStatePanel state="LOADING" />;
  if (error) return <RequestError error={error} onRetry={retry} />;
  return <main className="operations-data-page" aria-label="운영 데이터 상태"><header className="operations-data-header"><div><p className="operations-data-eyebrow">UI-OPS-05 · DATA_STATUS_READ</p><h1>운영 데이터 상태</h1><p>현재 운영 위험 판단에 쓰는 데이터의 freshness/coverage 확인.</p></div><dl><Metric label="전체 데이터 상태"><State value={result?.dataState} /></Metric><Metric label="기준 시각">{time(result?.referenceTime)}</Metric><Metric label="생성 시각">{time(result?.generatedAt)}</Metric></dl></header><StatusLegend /><p className="operations-data-safety-notice">결측 데이터는 정상 값으로 대체하지 않습니다.</p><SourceSummary result={result} /><Inventory inventory={result?.inventory} /><div className="operations-data-supporting"><Prediction prediction={result?.prediction} /><Profile profile={result?.profile} /></div><Limitations limitations={result?.limitations} /></main>;
}
