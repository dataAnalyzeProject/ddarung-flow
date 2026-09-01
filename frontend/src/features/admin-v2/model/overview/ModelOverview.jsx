import { useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import { REGISTRY_STATES } from './modelOverviewAdapter';
import './modelOverview.css';

function isAccessError(error) { return error?.status === 401 || error?.status === 403; }
function shortSha(value) { return value ? value.slice(0, 12) : ''; }
function RegistryCountCard({ state, count }) { return <article className="model-overview-count-card" aria-label={`레지스트리 ${state}`}><p>레지스트리 {state}</p><strong>{count}</strong></article>; }
function SourceState({ source, permission, label }) {
  if (source?.state === 'FORBIDDEN') return <AsyncStatePanel state="FORBIDDEN" code={source.error?.code} requiredPermission={permission} />;
  if (source?.state === 'ERROR') return <AsyncStatePanel state="ERROR" code={source.error?.code} />;
  return <p className="model-overview-unavailable">{label} 확인 정보 없음</p>;
}
function LoadingOverview() { return <main className="model-overview-page" aria-label="모델 운영 현황"><p className="model-overview-eyebrow">UI-MODEL-01</p><AsyncStatePanel state="LOADING" /></main>; }

export default function ModelOverview({ createAdapter }) {
  const [result, setResult] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true);
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(null); setResult(null); adapter.load({ signal: controller.signal }).then((next) => { if (!controller.signal.aborted) setResult(next); }).catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError') setError(nextError); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [adapter]);
  if (loading) return <LoadingOverview />;
  if (error) return <AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'MODEL_METRICS_READ' : undefined} />;
  const runtime = result?.runtime; const registry = result?.registry; const models = registry?.data || []; const counts = result?.registryStateCounts;
  return <main className="model-overview-page" aria-label="모델 운영 현황">
    <header className="model-overview-header"><div><p className="model-overview-eyebrow">UI-MODEL-01</p><h1>모델 운영 현황</h1><p>inference runtime과 ModelOps lifecycle은 서로 독립된 source로 표시합니다.</p></div><span className="model-overview-source">Source: runtime + registry</span></header>
    <section className="model-overview-service-card" aria-labelledby="service-model-heading"><div><p>서비스 모델</p><h2 id="service-model-heading">{runtime?.state === 'SUCCESS' ? runtime.data.modelVersion : 'UNKNOWN'}</h2></div>{runtime?.state === 'SUCCESS' ? <dl className="model-overview-runtime-meta"><div><dt>Serving</dt><dd>LIVE INFERENCE</dd></div><div><dt>Artifact SHA</dt><dd>{shortSha(runtime.data.artifactSha256)}</dd></div><div><dt>Source</dt><dd>{runtime.data.modelSource}</dd></div><div><dt>지원 범위</dt><dd>H{runtime.data.supportedHorizons.join(', H')} · 수량 {runtime.data.supportedQuantities.join(', ')}</dd></div><div><dt>Loaded</dt><dd>{new Date(runtime.data.loadedAt).toLocaleString('ko-KR')}</dd></div></dl> : <SourceState source={runtime} permission="MODEL_METRICS_READ" label="실시간 inference runtime" />}</section>
    <section className="model-overview-section" aria-labelledby="registry-status-heading"><div className="model-overview-section-heading"><div><h2 id="registry-status-heading">ModelOps lifecycle</h2><p>registry 상태는 serving identity의 대체값이 아닙니다.</p></div>{registry?.state === 'SUCCESS' && models.length ? <span>총 {models.length}개</span> : null}</div>{registry?.state !== 'SUCCESS' ? <SourceState source={registry} permission="MODEL_METRICS_READ" label="ModelOps lifecycle" /> : !models.length ? <p className="model-overview-unavailable">등록된 ModelOps lifecycle 항목 없음</p> : <><div className="model-overview-count-grid">{REGISTRY_STATES.map((state) => <RegistryCountCard key={state} state={state} count={counts[state]} />)}</div><section className="model-overview-summary-grid" aria-label="검증 및 승인 상태 요약"><article><p>검증 상태</p><strong>VALIDATED {counts.VALIDATED}</strong><small>registry state count only</small></article><article><p>승인 상태</p><strong>APPROVED {counts.APPROVED}</strong><small>registry state count only</small></article></section></>}</section>
    <section className="model-overview-limitation" aria-labelledby="model-limitation-heading"><div><h2 id="model-limitation-heading">표시 한계</h2><p>레지스트리 lifecycle은 live inference의 증거가 아니며, runtime readback 실패 시 서비스 모델은 UNKNOWN으로 유지합니다.</p></div><nav aria-label="모델 화면 이동"><a href="/admin/models/performance">모델 검증</a><a href="/admin/models/releases">모델 버전 관리</a></nav></section>
  </main>;
}
