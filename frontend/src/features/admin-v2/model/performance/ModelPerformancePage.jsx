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
  if (!combinations.length) return <section className="model-performance-detail-card" aria-labelledby="reliability-heading"><div className="model-performance-section-heading"><div><h2 id="reliability-heading">조합별 신뢰도</h2><p>서버가 내려준 평가 조합만 표시합니다.</p></div></div><AsyncStatePanel state="EMPTY" /></section>;
  return <section className="model-performance-detail-card" aria-labelledby="reliability-heading"><div className="model-performance-section-heading"><div><h2 id="reliability-heading">조합별 신뢰도</h2><p>서버가 내려준 평가 조합만 표시합니다.</p></div><span>{combinations.length}개 조합</span></div><div className="model-performance-table-wrap"><table><caption>서버가 내려준 조합의 Brier score 및 표본 수</caption><thead><tr><th scope="col">예측 구간</th><th scope="col">필요 자전거</th><th scope="col">Brier score</th><th scope="col">표본 수</th></tr></thead><tbody>{combinations.map((row, index) => {
    const insufficient = row?.brierScore == null;
    return <tr key={`${row?.horizonMinutes}-${row?.requiredBikeCount}-${index}`}><th scope="row">H{row?.horizonMinutes / 60}</th><td>{row?.requiredBikeCount}대</td><td><strong>{insufficient ? '표본 부족' : formatNumber(row.brierScore)}</strong>{insufficient ? <small>UNKNOWN_INSUFFICIENT_SAMPLES</small> : null}</td><td>{formatCount(row?.sampleCount)}</td></tr>;
  })}</tbody></table></div><p className="model-performance-note">Brier score가 값 없음인 조합은 표본 기준을 충족하지 않아 수치로 대체하지 않습니다. 전체 가중 수치는 원본에 없으므로 표시하지 않습니다.</p></section>;
}

function Calibration({ evaluation, bins }) {
  const horizon = evaluation.referenceHorizonMinutes;
  const count = evaluation.referenceRequiredBikeCount;
  if (!bins.length) return <section className="model-performance-detail-card" aria-labelledby="calibration-heading"><div className="model-performance-section-heading"><div><h2 id="calibration-heading">참조 조합 보정</h2><p>서버가 내려준 H{horizon / 60} · 필요 자전거 {count}대 조합만 표시합니다.</p></div></div><AsyncStatePanel state="EMPTY" /></section>;
  return <section className="model-performance-detail-card" aria-labelledby="calibration-heading"><div className="model-performance-section-heading"><div><h2 id="calibration-heading">참조 조합 보정</h2><p>서버가 내려준 H{horizon / 60} · 필요 자전거 {count}대 조합만 표시합니다.</p></div></div><div className="model-performance-table-wrap"><table><caption>보정 구간별 표본, 예측 평균, 실제 비율</caption><thead><tr><th scope="col">확률 구간</th><th scope="col">표본</th><th scope="col">예측 평균</th><th scope="col">실제 비율</th></tr></thead><tbody>{bins.map((bin) => <tr key={`${bin?.binLowerPercent}-${bin?.binUpperPercent}`}><th scope="row">{bin?.binLowerPercent}–{bin?.binUpperPercent}%</th><td>{formatCount(bin?.sampleCount)}</td><td>{bin?.sampleCount === 0 ? '표본 없음' : formatNumber(bin?.meanPredicted, 3)}</td><td>{bin?.sampleCount === 0 ? '표본 없음' : formatNumber(bin?.actualRate, 3)}</td></tr>)}</tbody></table></div><p className="model-performance-note">표본 0은 관측된 0개이며, 예측 평균과 실제 비율의 값 없음은 0으로 해석하지 않습니다.</p></section>;
}

function Evidence({ base }) {
  return <section className="model-performance-evidence" aria-labelledby="evidence-heading">
    <h2 id="evidence-heading">평가 근거</h2>
    <dl>
      <div><dt>평가 스냅샷</dt><dd>{base.modelVersion}</dd></div>
      <div><dt>생성 시각</dt><dd>{formatTime(base.generatedAt)}</dd></div>
      <div><dt>아티팩트 SHA</dt><dd title={base.artifactSha256}>{shortSha(base.artifactSha256)}</dd></div>
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
    <div><p>현재 서빙 모델</p><strong>{available ? runtime.data.modelVersion : '확인 불가'}</strong>{available ? <small>실시간 추론 중</small> : <small>실시간 추론 런타임 확인 불가</small>}</div>
    {available ? <div className="model-performance-runtime-details"><p>아티팩트 SHA: <span title={runtime.data.artifactSha256}>{shortSha(runtime.data.artifactSha256)}</span> · 출처: {runtime.data.modelSource} · 적재 시각: {formatTime(runtime.data.loadedAt)}</p><p>{matchesEvaluation ? '현재 서빙 모델과 동일한 버전의 평가 결과' : '현재 서빙 모델과 평가 스냅샷 버전이 다름'}</p></div> : <p>평가 스냅샷은 계속 표시하며, 런타임 엔드포인트가 확인되지 않아 현재 서빙 모델은 알 수 없습니다.</p>}
  </section>;
}

const DIAGNOSTICS_PAGE_SIZE = 50;

function metricValue(segment, name, fallback) {
  const value = segment?.[name] ?? (fallback ? segment?.[fallback] : null);
  return value == null ? '—' : formatNumber(value, 4);
}

function Diagnostics({ source }) {
  const [page, setPage] = useState(0);
  const heading = <div className="model-performance-section-heading"><div><h2 id="diagnostics-heading">진단</h2><p>동일 평가 스냅샷의 구간·대여소 근거입니다.</p></div></div>;
  if (source?.state === 'ACCESS_LIMITED') return <section className="model-performance-detail-card" aria-labelledby="diagnostics-heading">{heading}<p className="model-performance-note">진단 접근 제한 · 필요 권한: MODEL_DIAGNOSTICS_READ</p></section>;
  if (source?.state === 'FORBIDDEN') return <section className="model-performance-detail-card" aria-labelledby="diagnostics-heading">{heading}<AsyncStatePanel state="FORBIDDEN" code={source.error?.code} requiredPermission="MODEL_DIAGNOSTICS_READ" /></section>;
  if (source?.state === 'ERROR') return <section className="model-performance-detail-card" aria-labelledby="diagnostics-heading">{heading}<AsyncStatePanel state="ERROR" code={source.error?.code} /></section>;
  const segments = source?.data?.segments || [];
  if (!segments.length) return <section className="model-performance-detail-card" aria-labelledby="diagnostics-heading">{heading}<AsyncStatePanel state="EMPTY" /></section>;
  const totalPages = Math.ceil(segments.length / DIAGNOSTICS_PAGE_SIZE);
  const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = currentPage * DIAGNOSTICS_PAGE_SIZE;
  const visible = segments.slice(start, start + DIAGNOSTICS_PAGE_SIZE);
  return <section className="model-performance-detail-card model-performance-diagnostics" aria-labelledby="diagnostics-heading"><div className="model-performance-section-heading"><div><h2 id="diagnostics-heading">진단</h2><p>서버가 내려준 구간·대여소 근거만 표시합니다.</p></div><span>{formatCount(segments.length)}개</span></div><div className="model-performance-table-wrap"><table><caption>구간별 성능 진단</caption><thead><tr><th scope="col">구분</th><th scope="col">대상</th><th scope="col">상태</th><th scope="col">표본</th><th scope="col">Brier</th><th scope="col">기준 Brier</th><th scope="col">스킬 점수</th><th scope="col">품절 재현율</th></tr></thead><tbody>{visible.map((segment, index) => <tr key={`${segment.axis || segment.name || 'segment'}-${segment.segmentValue || start + index}`}><td>{segment.axis || segment.name || '확인 정보 없음'}</td><td>{segment.segmentValue ?? '—'}</td><td>{segment.status || segment.state || '확인 정보 없음'}</td><td>{formatCount(segment.sampleCount)}</td><td>{metricValue(segment, 'brierScore', 'brier')}</td><td>{metricValue(segment, 'baselineBrierScore')}</td><td>{metricValue(segment, 'skillScore')}</td><td>{metricValue(segment, 'shortageRecall')}</td></tr>)}</tbody></table></div>{totalPages > 1 ? <nav className="model-performance-pagination" aria-label="진단 목록 페이지"><button type="button" disabled={currentPage <= 0} onClick={() => setPage(currentPage - 1)}>이전</button><span>{formatCount(start + 1)}–{formatCount(start + visible.length)} / 전체 {formatCount(segments.length)}건 · {currentPage + 1} / {totalPages} 페이지</span><button type="button" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>다음</button></nav> : null}<p className="model-performance-note">null 또는 표본 부족 값은 0으로 대체하지 않습니다. 전체 {formatCount(segments.length)}건을 한 페이지에 최대 {DIAGNOSTICS_PAGE_SIZE}건씩 표시합니다.</p></section>;
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
      : adapter.loadBase({ signal: controller.signal }).then(async (base) => ({ base, runtime: { state: 'ERROR', error: { code: 'MODEL_RUNTIME_PREVIEW_UNAVAILABLE' } }, diagnostics: adapter.loadDiagnostics ? { state: 'SUCCESS', data: await adapter.loadDiagnostics(base, { signal: controller.signal }) } : { state: 'ACCESS_LIMITED', permission: 'MODEL_DIAGNOSTICS_READ' } }));
    load
      .then((nextResult) => { if (!controller.signal.aborted) setResult(nextResult); })
      .catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError') setError(nextError); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [adapter, version]);

  if (loading) return <main className="model-performance-page" aria-label="성능 · 신뢰도"><AsyncStatePanel state="LOADING" /></main>;
  if (error) return <BaseError error={error} onRetry={retry} />;
  const { base, runtime, diagnostics } = result;
  return <main className="model-performance-page" aria-label="성능 · 신뢰도">
    <header className="model-performance-header"><div><h1>성능 · 신뢰도</h1><p>평가 스냅샷의 성능과 보정 결과를 표시합니다.</p></div><span className="model-performance-source">출처: 평가 스냅샷</span></header>
    <RuntimeIdentity runtime={runtime} base={base} />
    <Evidence base={base} />
    <div className="model-performance-detail-grid"><ReliabilityTable combinations={base.combinations} /><Calibration evaluation={base.evaluation} bins={base.calibrationBins} /></div>
    <Diagnostics source={diagnostics} />
  </main>;
}
