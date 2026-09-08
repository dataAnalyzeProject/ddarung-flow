import { useEffect, useMemo, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const LABELS = { NORMAL: '정상', PARTIAL: '일부 사용 가능', UNAVAILABLE: '사용 불가', INSUFFICIENT_DATA: '판단 정보 부족', NOT_INSTRUMENTED: '계측되지 않음' };
const time = (value) => value ? new Date(value).toLocaleString('ko-KR') : '—';
const count = (value) => typeof value === 'number' ? value.toLocaleString('ko-KR') : '—';
function State({ value }) { return <mark className={`data-pipeline-state data-pipeline-state--${String(value).toLowerCase()}`}>{LABELS[value] || value}</mark>; }

export default function DataPipelinePage({ createAdapter }) {
  const adapter = useMemo(() => createAdapter(), [createAdapter]); const [result, setResult] = useState(null); const [error, setError] = useState(null);
  useEffect(() => { const controller = new AbortController(); adapter.load({ signal: controller.signal }).then(setResult).catch((next) => { if (next?.name !== 'AbortError') setError(next); }); return () => controller.abort(); }, [adapter]);
  if (error) return <AsyncStatePanel state={error.status === 401 || error.status === 403 ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission="DATA_STATUS_READ" />;
  if (!result) return <AsyncStatePanel state="LOADING" />;
  return <main className="data-pipeline-page" aria-label="수집·가공 파이프라인"><header className="data-pipeline-header"><div><p>UI-DATA-02 · DATA_STATUS_READ</p><h1>수집·가공 파이프라인</h1><span>최근 데이터가 어느 단계까지 실제로 관측되는지 확인합니다.</span></div><div><State value={result.dataState} /><small>기준 {time(result.referenceTime)}</small></div></header>
    <p className="operations-data-safety-notice">앱 서비스가 읽을 factual ledger가 없는 단계는 계측되지 않음으로 표시합니다. Serving DB의 freshness로 Airflow 또는 OCI 성공을 추정하지 않습니다.</p>
    <ol className="data-pipeline-flow">{result.stages.map((stage, index) => <li key={stage.stageId}><details><summary className="data-pipeline-stage-heading"><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{stage.label}</h2><code>{stage.stageId}</code></div><State value={stage.dataState} /></summary>
      {stage.dataState === 'NOT_INSTRUMENTED' ? <p className="data-pipeline-unavailable">현재 관리자 서비스가 읽을 수 있는 원본이 없습니다. <strong>{stage.reasonCode}</strong></p> : <><dl><div><dt>마지막 성공</dt><dd>{time(stage.lastSuccessAt)}</dd></div><div><dt>마지막 시도</dt><dd>{time(stage.lastAttemptAt)}</dd></div><div><dt>처리</dt><dd>{count(stage.processedCount)}</dd></div><div><dt>통과</dt><dd>{count(stage.passedCount)}</dd></div><div><dt>격리</dt><dd>{count(stage.quarantinedCount)}</dd></div><div><dt>실패/미완료</dt><dd>{count(stage.failedCount)}</dd></div><div><dt>source</dt><dd>{stage.sourceReference || '—'}</dd></div></dl>{stage.reasonCode && <p className="data-pipeline-unavailable">제한: <strong>{stage.reasonCode}</strong></p>}</>}
    </details></li>)}</ol>
  </main>;
}
