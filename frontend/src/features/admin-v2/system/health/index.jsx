import AsyncStatePanel from '../../components/AsyncStatePanel';
import './systemHealth.css';

const UNINSTRUMENTED_SCOPES = [
  {
    title: '서비스 런타임',
    description: '백엔드, JVM, 컨테이너 상태를 제공하는 공개 관리자 원본이 연결되지 않았습니다.',
    fields: '상태 · 가동 시간 · 응답 지연',
  },
  {
    title: '인프라 자원',
    description: 'Prometheus 또는 Grafana 기반의 관리자용 관측 지표 원본이 확인되지 않았습니다.',
    fields: 'CPU · 메모리 · SLO',
  },
  {
    title: 'AI 및 도구',
    description: '여정 안내와 LLM 공급자, 대체 경로 상태를 공개하는 관리자 원본이 연결되지 않았습니다.',
    fields: '공급자 상태 · 대체 경로 · 도구 실행 상태',
  },
];

export default function SystemHealthPage() {
  return <main className="system-health-page" aria-label="시스템 상태">
    <header className="system-health-header">
      <p>UI-SYS-04</p>
      <h1>시스템 상태</h1>
      <p>실제 관리 원본으로 확인할 수 있는 상태만 표시합니다.</p>
    </header>

    <section className="system-health-status" aria-labelledby="system-health-status-title">
      <div>
        <p className="system-health-kicker">현재 관측 연결</p>
        <h2 id="system-health-status-title">관리자용 상태 원본 미연결</h2>
        <p>서비스 이상이나 정상으로 판정한 결과가 아닙니다. 현재 화면에서 확인할 수 있는 공개 원본이 없다는 뜻입니다.</p>
      </div>
      <AsyncStatePanel state="UNAVAILABLE" code="NOT_INSTRUMENTED" requiredPermission="SYSTEM_STATUS_READ" />
    </section>

    <section className="system-health-scope" aria-labelledby="system-health-scope-title">
      <div className="system-health-section-heading">
        <h2 id="system-health-scope-title">관측 범위</h2>
        <p>아래 항목은 값을 추정하지 않으며 원본 계약이 생길 때까지 측정되지 않음으로 유지합니다.</p>
      </div>
      <ul>
        {UNINSTRUMENTED_SCOPES.map((scope) => <li key={scope.title}>
          <div>
            <h3>{scope.title}</h3>
            <p>{scope.description}</p>
          </div>
          <div className="system-health-scope-state">
            <strong>계측되지 않음</strong>
            <span>{scope.fields}</span>
          </div>
        </li>)}
      </ul>
    </section>

    <aside className="system-health-boundary" aria-label="상태 해석 안내">
      <strong>상태 해석</strong>
      <p>운영 데이터 상태와 모델 상태는 각 DATA·MODEL 화면에서 확인합니다. 이 화면은 다른 영역의 값을 시스템 상태로 바꾸어 표시하지 않습니다.</p>
    </aside>
  </main>;
}
