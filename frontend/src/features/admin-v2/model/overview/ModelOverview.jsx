import { useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import { REGISTRY_STATES } from './modelOverviewAdapter';
import './modelOverview.css';

const STATE_LABELS = {
  DRAFT: 'DRAFT',
  VALIDATED: 'VALIDATED',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
};

function isAccessError(error) { return error?.status === 401 || error?.status === 403; }

function RegistryCountCard({ state, count }) {
  return <article className="model-overview-count-card" aria-label={`레지스트리 ${state}`}>
    <p>레지스트리 {STATE_LABELS[state]}</p>
    <strong>{count}</strong>
  </article>;
}

function LoadingOverview() {
  return <main className="model-overview-page" aria-label="모델 운영 현황">
    <p className="model-overview-eyebrow">UI-MODEL-01</p>
    <AsyncStatePanel state="LOADING" />
  </main>;
}

export default function ModelOverview({ createAdapter }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const adapter = useMemo(() => createAdapter(), [createAdapter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setResult(null);
    adapter.load({ signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setResult(next); })
      .catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError') setError(nextError); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [adapter]);

  if (loading) return <LoadingOverview />;
  if (error) return <AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'MODEL_METRICS_READ' : undefined} />;

  const counts = result?.registryStateCounts || Object.fromEntries(REGISTRY_STATES.map((state) => [state, 0]));
  return <main className="model-overview-page" aria-label="모델 운영 현황">
    <header className="model-overview-header">
      <div>
        <p className="model-overview-eyebrow">UI-MODEL-01</p>
        <h1>모델 운영 현황</h1>
        <p>레지스트리 상태를 요약하며, runtime에서 실제 serving 중인 모델은 별도 readback source가 필요합니다.</p>
      </div>
      <span className="model-overview-source">Source: 모델 레지스트리</span>
    </header>

    <section className="model-overview-service-card" aria-labelledby="service-model-heading">
      <div>
        <p>서비스 모델</p>
        <h2 id="service-model-heading">UNKNOWN</h2>
      </div>
      <p>현재 inference/runtime이 serving 중인 registry version 또는 artifact identity를 검증할 readback source가 구현되지 않았습니다.</p>
    </section>

    <section className="model-overview-section" aria-labelledby="registry-status-heading">
      <div className="model-overview-section-heading">
        <div><h2 id="registry-status-heading">레지스트리 상태</h2><p>등록된 모델의 state만 집계합니다.</p></div>
        <span>총 {result?.models?.length ?? 0}개</span>
      </div>
      <div className="model-overview-count-grid">
        {REGISTRY_STATES.map((state) => <RegistryCountCard key={state} state={state} count={counts[state]} />)}
      </div>
    </section>

    <section className="model-overview-summary-grid" aria-label="검증 및 승인 상태 요약">
      <article><p>검증 상태</p><strong>VALIDATED {counts.VALIDATED}</strong><small>state count only</small></article>
      <article><p>승인 상태</p><strong>APPROVED {counts.APPROVED}</strong><small>state count only</small></article>
    </section>

    <section className="model-overview-limitation" aria-labelledby="model-limitation-heading">
      <div><h2 id="model-limitation-heading">표시 한계</h2><p>레지스트리 ACTIVE, VALIDATED, APPROVED는 runtime serving identity의 증거가 아닙니다. prediction batch는 별도 권한 계약 때문에 이 화면에 포함하지 않습니다.</p></div>
      <nav aria-label="모델 화면 이동"><a href="/admin/models/performance">모델 검증</a><a href="/admin/models/releases">모델 버전 관리</a></nav>
    </section>
  </main>;
}
