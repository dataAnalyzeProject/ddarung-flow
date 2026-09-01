import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import './modelPerformance.css';

function formatNumber(value, digits = 4) { return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function formatCount(value) { return typeof value === 'number' ? value.toLocaleString('ko-KR') : '확인 정보 없음'; }
function formatTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '확인 정보 없음';
}
function shortSha(value) { return typeof value === 'string' && value.length > 18 ? `${value.slice(0, 12)}…${value.slice(-6)}` : '확인 정보 없음'; }
function GaugeIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16a8 8 0 1 1 16 0M12 12l3-3M12 12v.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M7 19h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>; }

function BaseError({ error, onRetry }) {
  if (error?.status === 404 && error?.code === 'MODEL_PERFORMANCE_NOT_FOUND') return <div className="model-performance-request-error"><AsyncStatePanel state="EMPTY" code={error.code} /></div>;
  if (error?.status === 401) return <div className="model-performance-request-error"><AsyncStatePanel state="FORBIDDEN" code="AUTH_REQUIRED" /></div>;
  if (error?.status === 403) return <div className="model-performance-request-error"><AsyncStatePanel state="FORBIDDEN" code={error?.code} requiredPermission="MODEL_METRICS_READ" /></div>;
  return <div className="model-performance-request-error"><AsyncStatePanel state="ERROR" code={error?.code} /><button type="button" onClick={onRetry}>다시 시도</button></div>;
}

function ReliabilityTable({ combinations }) {
  if (!combinations.length) return <section className="model-performance-detail-card" aria-labelledby="reliability-heading"><div className="model-performance-section-heading"><div><h2 id="reliability-heading">조합별 신뢰도</h2><p>source가 반환한 평가 조합만 표시합니다.</p></div></div><AsyncStatePanel state="EMPTY" /></section>;
  return <section className="model-performance-detail-card" aria-labelledby="reliability-heading"><div className="model-performance-section-heading"><div><h2 id="reliability-heading">조합별 신뢰도</h2><p>source가 반환한 평가 조합만 표시합니다.</p></div><span>{combinations.length}개 조합</span></div><div className="model-performance-table-wrap"><table><caption>source 반환 조합의 Brier score 및 표본 수</caption><thead><tr><th scope="col">예측 구간</th><th scope="col">필요 자전거</th><th scope="col">Brier score</th><th scope="col">표본 수</th></tr></thead><tbody>{combinations.map((row, index) => {
    const insufficient = row?.brierScore == null;
    return <tr key={`${row?.horizonMinutes}-${row?.requiredBikeCount}-${index}`}><th scope="row">H{row?.horizonMinutes / 60}</th><td>{row?.requiredBikeCount}대</td><td><strong>{insufficient ? '표본 부족' : formatNumber(row.brierScore)}</strong>{insufficient ? <small>UNKNOWN_INSUFFICIENT_SAMPLES</small> : null}</td><td>{formatCount(row?.sampleCount)}</td></tr>;
  })}</tbody></table></div><p className="model-performance-note">Brier가 null인 조합은 표본 기준을 충족하지 않아 수치로 대체하지 않습니다. 전체 가중 수치는 source에 없으므로 표시하지 않습니다.</p></section>;
}

function Calibration({ evaluation, bins }) {
  const horizon = evaluation.referenceHorizonMinutes;
  const count = evaluation.referenceRequiredBikeCount;
  if (!bins.length) return <section className="model-performance-detail-card" aria-labelledby="calibration-heading"><div className="model-performance-section-heading"><div><h2 id="calibration-heading">참조 조합 보정</h2><p>source가 제공한 H{horizon / 60} · 필요 자전거 {count}대 조합만 표시합니다.</p></div></div><AsyncStatePanel state="EMPTY" /></section>;
  return <section className="model-performance-detail-card" aria-labelledby="calibration-heading"><div className="model-performance-section-heading"><div><h2 id="calibration-heading">참조 조합 보정</h2><p>source가 제공한 H{horizon / 60} · 필요 자전거 {count}대 조합만 표시합니다.</p></div></div><div className="model-performance-table-wrap"><table><caption>보정 구간별 표본, 예측 평균, 실제 비율</caption><thead><tr><th scope="col">확률 구간</th><th scope="col">표본</th><th scope="col">예측 평균</th><th scope="col">실제 비율</th></tr></thead><tbody>{bins.map((bin) => <tr key={`${bin?.binLowerPercent}-${bin?.binUpperPercent}`}><th scope="row">{bin?.binLowerPercent}–{bin?.binUpperPercent}%</th><td>{formatCount(bin?.sampleCount)}</td><td>{bin?.sampleCount === 0 ? '표본 없음' : formatNumber(bin?.meanPredicted, 3)}</td><td>{bin?.sampleCount === 0 ? '표본 없음' : formatNumber(bin?.actualRate, 3)}</td></tr>)}</tbody></table></div><p className="model-performance-note">표본 0은 관측된 0개이며, meanPredicted·actualRate의 null은 값 0으로 해석하지 않습니다.</p></section>;
}

function Evidence({ base }) {
  return <section className="model-performance-evidence" aria-labelledby="evidence-heading">
    <h2 id="evidence-heading">평가 근거</h2>
    <dl>
      <div><dt>평가 snapshot</dt><dd>{base.modelVersion}</dd></div>
      <div><dt>생성 시각</dt><dd>{formatTime(base.generatedAt)}</dd></div>
      <div><dt>artifact SHA</dt><dd title={base.artifactSha256}>{shortSha(base.artifactSha256)}</dd></div>
      <div><dt>데이터 상태</dt><dd>조합별 평가 결과 제공</dd></div>
    </dl>
    <p>전체 Brier score와 전체 표본 수는 base contract에 없으므로 추정하거나 합산하지 않습니다.</p>
  </section>;
}

function RuntimeIdentity({ runtime, base }) {
  const available = runtime?.state === 'SUCCESS';
  const matchesEvaluation = available && runtime.data.modelVersion === base.modelVersion && runtime.data.artifactSha256 === base.artifactSha256;
  return <section className="model-performance-identity" aria-label="현재 서빙 모델">
    <span className="model-performance-identity-icon" aria-hidden="true"><GaugeIcon /></span>
    <div><p>현재 서빙 모델</p><strong>{available ? runtime.data.modelVersion : 'UNKNOWN'}</strong>{available ? <small>LIVE INFERENCE</small> : <small>실시간 inference runtime 확인 불가</small>}</div>
    {available ? <div className="model-performance-runtime-details"><p>Artifact SHA: <span title={runtime.data.artifactSha256}>{shortSha(runtime.data.artifactSha256)}</span> · Source: {runtime.data.modelSource} · Loaded: {formatTime(runtime.data.loadedAt)}</p><p>{matchesEvaluation ? '현재 서빙 모델과 동일한 버전의 평가 결과' : '현재 서빙 모델과 평가 snapshot 버전이 다름'}</p></div> : <p>평가 snapshot은 계속 표시하며, runtime endpoint가 확인되지 않아 현재 서빙 모델은 알 수 없습니다.</p>}
  </section>;
}

export default function ModelPerformancePage({ createAdapter }) {
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setResult(null);
    const load = adapter.load
      ? adapter.load({ signal: controller.signal })
      : adapter.loadBase({ signal: controller.signal }).then((base) => ({ base, runtime: { state: 'ERROR', error: { code: 'MODEL_RUNTIME_PREVIEW_UNAVAILABLE' } } }));
    load
      .then((nextResult) => { if (!controller.signal.aborted) setResult(nextResult); })
      .catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError') setError(nextError); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [adapter, version]);

  if (loading) return <main className="model-performance-page" aria-label="성능 · 신뢰도"><AsyncStatePanel state="LOADING" /></main>;
  if (error) return <BaseError error={error} onRetry={retry} />;
  const { base, runtime } = result;
  return <main className="model-performance-page" aria-label="성능 · 신뢰도">
    <header className="model-performance-header"><div><h1>성능 · 신뢰도</h1><p>평가 snapshot의 성능과 보정 결과를 표시합니다.</p></div><span className="model-performance-source">Source: evaluation snapshot</span></header>
    <RuntimeIdentity runtime={runtime} base={base} />
    <Evidence base={base} />
    <div className="model-performance-detail-grid"><ReliabilityTable combinations={base.combinations} /><Calibration evaluation={base.evaluation} bins={base.calibrationBins} /></div>
  </main>;
}
