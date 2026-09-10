import { useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import { REGISTRY_STATES } from './modelOverviewAdapter';
import './modelOverview.css';

function isAccessError(error) { return error?.status === 401 || error?.status === 403; }
function shortSha(value) { return value ? value.slice(0, 12) : ''; }
function ServiceModelIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" /><path d="M4 7.5 12 12l8-4.5M12 12v9" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" /></svg>; }
function RegistryCountCard({ state, count }) { return <article className="model-overview-count-card" aria-label={`레지스트리 ${state}`}><p>레지스트리 {state}</p><strong>{count ?? 0}</strong></article>; }
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
    <header className="model-overview-header"><div><p className="model-overview-eyebrow">UI-MODEL-01</p><h1>모델 운영 현황</h1><p>실시간 추론 런타임과 모델 수명주기는 서로 독립된 원본으로 표시합니다.</p></div><span className="model-overview-source">출처: 런타임 + 레지스트리</span></header>
    <section className="model-overview-service-card" aria-labelledby="service-model-heading"><span className="model-overview-service-icon" aria-hidden="true"><ServiceModelIcon /></span><div className="model-overview-service-identity"><p>서비스 모델</p><h2 id="service-model-heading">{runtime?.state === 'SUCCESS' ? runtime.data.modelVersion : '확인 불가'}</h2></div>{runtime?.state === 'SUCCESS' ? <dl className="model-overview-runtime-meta"><div><dt>서빙 상태</dt><dd>실시간 추론 중</dd></div><div><dt>아티팩트 SHA</dt><dd>{shortSha(runtime.data.artifactSha256)}</dd></div><div><dt>출처</dt><dd>{runtime.data.modelSource}</dd></div><div><dt>지원 범위</dt><dd>H{runtime.data.supportedHorizons.join(', H')} · 수량 {runtime.data.supportedQuantities.join(', ')}</dd></div><div><dt>적재 시각</dt><dd>{new Date(runtime.data.loadedAt).toLocaleString('ko-KR')}</dd></div></dl> : <SourceState source={runtime} permission="MODEL_METRICS_READ" label="실시간 추론 런타임" />}</section>
    <section className="model-overview-section" aria-labelledby="registry-status-heading"><div className="model-overview-section-heading"><div><h2 id="registry-status-heading">모델 수명주기</h2><p>레지스트리 상태는 서빙 모델 식별 정보를 대신하지 않습니다.</p></div>{registry?.state === 'SUCCESS' && models.length ? <span>총 {models.length}개</span> : null}</div>{registry?.state !== 'SUCCESS' ? <SourceState source={registry} permission="MODEL_METRICS_READ" label="모델 수명주기" /> : !models.length ? <p className="model-overview-unavailable">등록된 모델 수명주기 항목 없음</p> : <><div className="model-overview-count-grid">{REGISTRY_STATES.map((state) => <RegistryCountCard key={state} state={state} count={counts[state]} />)}</div><section className="model-overview-summary-grid" aria-label="검증 및 승인 상태 요약"><article><p>검증 상태</p><strong>VALIDATED {counts.VALIDATED}</strong><small>레지스트리 상태 집계값</small></article><article><p>승인 상태</p><strong>APPROVED {counts.APPROVED}</strong><small>레지스트리 상태 집계값</small></article></section></>}</section>
    <section className="model-overview-limitation" aria-labelledby="model-limitation-heading"><div><h2 id="model-limitation-heading">표시 한계</h2><p>레지스트리 수명주기는 실시간 추론의 증거가 아니며, 런타임 재확인에 실패하면 서비스 모델은 확인 불가로 유지합니다.</p></div><nav aria-label="모델 화면 이동"><a href="/admin/models/performance">모델 검증</a><a href="/admin/models/releases">모델 버전 관리</a></nav></section>
  </main>;
}
