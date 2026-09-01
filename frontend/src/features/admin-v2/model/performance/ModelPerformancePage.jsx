import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import './modelPerformance.css';

function formatNumber(value, digits = 4) { return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function formatCount(value) { return typeof value === 'number' ? value.toLocaleString('ko-KR') : '확인 정보 없음'; }
function formatTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '확인 정보 없음';
}
function shortSha(value) { return value.length > 18 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value; }

function BaseError({ error, onRetry }) {
  if (error?.status === 404 && error?.code === 'MODEL_PERFORMANCE_NOT_FOUND') {
    return <div className="model-performance-request-error"><AsyncStatePanel state="EMPTY" code={error.code} /></div>;
  }
  if (error?.status === 401) {
    return <div className="model-performance-request-error"><AsyncStatePanel state="FORBIDDEN" code="AUTH_REQUIRED" /></div>;
  }
  if (error?.status === 403) {
    return <div className="model-performance-request-error"><AsyncStatePanel state="FORBIDDEN" code={error?.code} requiredPermission="MODEL_METRICS_READ" /></div>;
  }
  return <div className="model-performance-request-error"><AsyncStatePanel state="ERROR" code={error?.code} /><button type="button" onClick={onRetry}>다시 시도</button></div>;
}

function ReliabilityTable({ combinations }) {
  return <section className="model-performance-section" aria-labelledby="reliability-heading"><div className="model-performance-section-heading"><div><h2 id="reliability-heading">조합별 신뢰도</h2><p>source가 반환한 평가 조합만 표시합니다.</p></div><span>{combinations.length}개 조합</span></div><div className="model-performance-table-wrap"><table><caption>source 반환 조합의 Brier score 및 표본 수</caption><thead><tr><th scope="col">예측 구간</th><th scope="col">필요 자전거</th><th scope="col">Brier score</th><th scope="col">표본 수</th></tr></thead><tbody>{combinations.map((row, index) => {
    const insufficient = row?.brierScore == null;
    return <tr key={`${row?.horizonMinutes}-${row?.requiredBikeCount}-${index}`}><th scope="row">H{row?.horizonMinutes / 60}</th><td>{row?.requiredBikeCount}대</td><td><strong>{insufficient ? '표본 부족' : formatNumber(row.brierScore)}</strong>{insufficient ? <small>UNKNOWN_INSUFFICIENT_SAMPLES</small> : null}</td><td>{formatCount(row?.sampleCount)}</td></tr>;
  })}</tbody></table></div><p className="model-performance-note">Brier가 null인 조합은 표본 기준을 충족하지 않아 수치로 대체하지 않습니다. 전체 가중 수치는 source에 없으므로 표시하지 않습니다.</p></section>;
}

function Calibration({ evaluation, bins }) {
  const horizon = evaluation.referenceHorizonMinutes;
  const count = evaluation.referenceRequiredBikeCount;
  return <section className="model-performance-section" aria-labelledby="calibration-heading"><div className="model-performance-section-heading"><div><h2 id="calibration-heading">참조 조합 보정</h2><p>source가 제공한 H{horizon / 60} · 필요 자전거 {count}대 조합만 표시합니다.</p></div></div><div className="model-performance-table-wrap"><table><caption>보정 구간별 표본, 예측 평균, 실제 비율</caption><thead><tr><th scope="col">확률 구간</th><th scope="col">표본</th><th scope="col">예측 평균</th><th scope="col">실제 비율</th></tr></thead><tbody>{bins.map((bin) => <tr key={`${bin?.binLowerPercent}-${bin?.binUpperPercent}`}><th scope="row">{bin?.binLowerPercent}–{bin?.binUpperPercent}%</th><td>{formatCount(bin?.sampleCount)}</td><td>{bin?.sampleCount === 0 ? '표본 없음' : formatNumber(bin?.meanPredicted, 3)}</td><td>{bin?.sampleCount === 0 ? '표본 없음' : formatNumber(bin?.actualRate, 3)}</td></tr>)}</tbody></table></div><p className="model-performance-note">표본 0은 관측된 0개이며, meanPredicted·actualRate의 null은 값 0으로 해석하지 않습니다.</p></section>;
}

function Diagnostics({ state, result, error }) {
  if (state === 'LOADING') return <section className="model-performance-diagnostics" aria-labelledby="diagnostics-heading"><h2 id="diagnostics-heading">진단</h2><p>진단 권한과 source를 확인하는 중입니다.</p></section>;
  if (state === 'AUTH_REQUIRED') return <section className="model-performance-diagnostics" aria-labelledby="diagnostics-heading"><h2 id="diagnostics-heading">진단</h2><AsyncStatePanel state="FORBIDDEN" code="AUTH_REQUIRED" /></section>;
  if (state === 'FORBIDDEN') return <section className="model-performance-diagnostics" aria-labelledby="diagnostics-heading"><h2 id="diagnostics-heading">진단</h2><p><strong>진단 접근 제한</strong> — MODEL_DIAGNOSTICS_READ 권한이 있어야 별도 진단 source를 표시합니다.</p></section>;
  if (state === 'UNAVAILABLE') return <section className="model-performance-diagnostics" aria-labelledby="diagnostics-heading"><h2 id="diagnostics-heading">진단</h2><p><strong>{error?.status === 404 ? '진단 source가 현재 없습니다.' : '진단 source와 통신할 수 없습니다.'}</strong></p>{error?.code ? <p>{error.code}</p> : null}</section>;
  if (state === 'ERROR') return <section className="model-performance-diagnostics" aria-labelledby="diagnostics-heading"><h2 id="diagnostics-heading">진단</h2><p>{error?.code === 'DIAGNOSTICS_SNAPSHOT_MISMATCH' ? '진단 스냅샷 일치 확인 불가' : '진단 서버 오류입니다.'}</p>{error?.code ? <p>{error.code}</p> : null}</section>;
  const segments = result?.segments || [];
  return <section className="model-performance-diagnostics" aria-labelledby="diagnostics-heading"><div className="model-performance-section-heading"><div><h2 id="diagnostics-heading">진단</h2><p>H2 · 필요 자전거 3대의 별도 diagnostics source입니다.</p></div><span>MODEL_DIAGNOSTICS_READ</span></div>{segments.length ? <div className="model-performance-table-wrap"><table><caption>source-returned 진단 구간</caption><thead><tr><th scope="col">축</th><th scope="col">구간</th><th scope="col">표본</th><th scope="col">Brier</th></tr></thead><tbody>{segments.map((segment, index) => <tr key={`${segment?.axis}-${segment?.segmentValue}-${index}`}><td>{segment?.axis || '확인 정보 없음'}</td><td>{segment?.segmentValue || '확인 정보 없음'}</td><td>{formatCount(segment?.sampleCount)}</td><td>{segment?.brierScore == null ? 'UNKNOWN_INSUFFICIENT_SAMPLES' : formatNumber(segment.brierScore)}</td></tr>)}</tbody></table></div> : <p>진단 source에 표시할 항목이 없습니다.</p>}</section>;
}

export default function ModelPerformancePage({ createAdapter }) {
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const [base, setBase] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState({ state: 'IDLE', result: null, error: null });
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const retry = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true); setError(null); setBase(null); setDiagnostics({ state: 'IDLE', result: null, error: null });
    adapter.loadBase({ signal: controller.signal }).then((nextBase) => {
      if (controller.signal.aborted || generation.current !== current) return;
      setBase(nextBase); setDiagnostics({ state: 'LOADING', result: null, error: null });
      adapter.loadDiagnostics(nextBase, { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted && generation.current === current) setDiagnostics({ state: 'SUCCESS', result, error: null });
      }).catch((nextError) => {
        if (!controller.signal.aborted && generation.current === current && nextError?.name !== 'AbortError') {
          const state = nextError?.status === 401 ? 'AUTH_REQUIRED'
            : nextError?.status === 403 ? 'FORBIDDEN'
              : nextError?.code === 'DIAGNOSTICS_SNAPSHOT_MISMATCH' ? 'ERROR'
                : nextError?.status === 404 ? 'UNAVAILABLE'
                  : nextError?.status == null ? 'UNAVAILABLE' : 'ERROR';
          setDiagnostics({ state, result: null, error: nextError });
        }
      });
    }).catch((nextError) => {
      if (!controller.signal.aborted && generation.current === current && nextError?.name !== 'AbortError') setError(nextError);
    }).finally(() => {
      if (!controller.signal.aborted && generation.current === current) setLoading(false);
    });
    return () => controller.abort();
  }, [adapter, version]);

  if (loading) return <AsyncStatePanel state="LOADING" />;
  if (error) return <BaseError error={error} onRetry={retry} />;
  return <main className="model-performance-page" aria-label="모델 검증"><header className="model-performance-header"><div><p className="model-performance-eyebrow">UI-MODEL-02 · MODEL_METRICS_READ</p><h1>모델 검증</h1><p>평가 snapshot의 성능과 보정 결과를 표시합니다.</p></div><span className="model-performance-source">evaluation snapshot</span></header><section className="model-performance-metadata" aria-label="평가 snapshot 정보"><dl><div><dt>모델 버전</dt><dd>{base.modelVersion}</dd></div><div><dt>artifact SHA</dt><dd title={base.artifactSha256}>{shortSha(base.artifactSha256)}</dd></div><div><dt>생성 시각</dt><dd>{formatTime(base.generatedAt)}</dd></div><div><dt>runtime serving identity</dt><dd>UNKNOWN</dd></div></dl><p>평가 artifact와 모델 버전은 runtime에서 실제 serving 중인 identity의 증거가 아닙니다.</p></section><ReliabilityTable combinations={base.combinations} /><Calibration evaluation={base.evaluation} bins={base.calibrationBins} /><Diagnostics state={diagnostics.state} result={diagnostics.result} error={diagnostics.error} /></main>;
}
