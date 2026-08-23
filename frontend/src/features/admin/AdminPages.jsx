import { useState } from "react";
import { canDo, fixture } from "./adminFixture";

const Icon = ({ children }) => <span className="admin-card-icon" aria-hidden="true">{children}</span>;
const Button = ({ children, onClick, kind = "secondary", disabled = false }) => <button type="button" className={`admin-button ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>;
const Chip = ({ children, tone = "blue" }) => <span className={`admin-chip ${tone}`}>{children}</span>;

function Section({ title, action, children, className = "" }) {
  return <section className={`admin-panel ${className}`}><header className="admin-panel-head"><h2>{title}</h2>{action}</header>{children}</section>;
}

function StatCard({ label, value, note, icon, tone = "blue" }) {
  return <article className={`admin-stat-card ${tone}`}><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div><Icon>{icon}</Icon></article>;
}

function MetricIcon({ type }) {
  const paths = {
    health: <><path d="M12 3.5 19 6v5.6c0 4.4-3 7.5-7 8.9-4-1.4-7-4.5-7-8.9V6l7-2.5Z" /><path d="m8.8 11.7 2.1 2.1 4.3-4.3" /></>,
    freshness: <><circle cx="12" cy="12" r="7.5" /><path d="M12 7.7v4.7l3.2 1.8" /></>,
    model: <><path d="m12 3.8 6.8 3.9v7.8L12 19.4l-6.8-3.9V7.7L12 3.8Z" /><path d="m5.4 7.8 6.6 3.8 6.6-3.8M12 11.6v7.5" /></>,
    alert: <><path d="M12 4.1 20 18H4l8-13.9Z" /><path d="M12 9v4.2M12 15.9v.1" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</g></svg>;
}

export function AdminStatePanel({ state }) {
  const content = {
    loading: ["불러오는 중", "fixture 화면을 준비하고 있습니다."],
    empty: ["표시할 fixture가 없습니다", "필터를 조정하거나 다시 시도해 주세요."],
    error: ["일시적으로 표시할 수 없습니다", "실제 API 오류가 아닌 fixture 상태입니다."],
    forbidden: ["관리자 권한이 필요합니다", "관리자 데이터와 카드, 표는 표시하지 않습니다."],
  }[state] || ["알 수 없는 상태", ""];
  return <section className="admin-state-panel" data-testid={`admin-${state}`} aria-live="polite"><Icon>{state === "error" ? "!" : state === "forbidden" ? "×" : "…"}</Icon><h1>{content[0]}</h1><p>{content[1]}</p></section>;
}

function AuditTable({ audit }) {
  return <table><thead><tr><th>시각</th><th>행위</th><th>사용자 역할</th><th>대상</th><th>결과</th></tr></thead><tbody>{audit.map((item) => <tr key={item.time}><td>{item.time}</td><td><strong>{item.action}</strong></td><td>{item.actor}</td><td>{item.target}</td><td><Chip tone="green">{item.result}</Chip></td></tr>)}</tbody></table>;
}

function Dashboard({ data }) {
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-01 · fixture only</p><h1>운영 현황</h1><span>실시간 운영 통계가 아닌 검토용 fixture입니다.</span></div><Chip tone="green">서비스 상태 · 정상</Chip></div>
    <div className="admin-stat-grid"><StatCard label="서비스 상태" value="정상" note="fixture 표시 상태" icon={<MetricIcon type="health" />} tone="green" /><StatCard label="데이터 신선도" value="15분" note="최근 배치 fixture" icon={<MetricIcon type="freshness" />} /><StatCard label="활성 모델" value="v17" note="승인된 fixture 모델" icon={<MetricIcon type="model" />} /><StatCard label="최근 실패" value="0건" note="운영 사실이 아닌 fixture" icon={<MetricIcon type="alert" />} tone="coral" /></div>
    <div className="admin-dashboard-top"><Section title="fixture 운영 추이" action={<span className="admin-filter-hint">최근 7회 기준</span>} className="admin-trend-panel"><div className="admin-line-chart" aria-label="fixture 운영 추이 차트"><svg viewBox="0 0 700 190" role="img" aria-label="fixture 값 변화"><path d="M22 143 L126 105 L230 132 L334 73 L438 94 L542 51 L674 78" fill="none" stroke="#176eea" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M22 143 L126 105 L230 132 L334 73 L438 94 L542 51 L674 78 L674 178 L22 178 Z" fill="url(#admin-chart-fill)" /><defs><linearGradient id="admin-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#277cf0" stopOpacity=".24" /><stop offset="1" stopColor="#277cf0" stopOpacity="0" /></linearGradient></defs></svg><div><span>08.15</span><span>08.16</span><span>08.17</span><span>08.18</span><span>08.19</span><span>08.20</span><span>08.21</span></div></div><p className="admin-chart-caption">운영 요청 128건 · 표시는 fixture이며 실시간 지표가 아닙니다.</p></Section>
      <Section title="운영 대기 항목" className="admin-pending-panel"><div className="admin-queue-list"><Queue icon="⇩" title="Export 요청 검토" detail="정거장 가용성 집계" badge="2건" /><Queue icon="◇" title="모델 승인 대기" detail="v16 검증 결과 확인" badge="1건" /><Queue icon="◌" title="Q&A 답변 대기" detail="예측 결과 카테고리" badge="1건" /></div></Section></div>
    <div className="admin-dashboard-bottom"><Section title="최근 감사 이벤트" action={<span className="admin-linkish">전체 보기 ›</span>}><AuditTable audit={data.audit} /></Section><Section title="운영 알림"><div className="admin-alert-list"><p><b>주의</b> 격리 항목 3건은 fixture 검토 대상입니다.</p><p><b>안내</b> Export는 callback만 전송합니다.</p><p><b>안내</b> 실제 운영 알림은 연결되지 않았습니다.</p></div></Section></div></>;
}

function Queue({ icon, title, detail, badge }) { return <div className="admin-queue"><Icon>{icon}</Icon><div><strong>{title}</strong><span>{detail}</span></div><Chip>{badge}</Chip></div>; }

function Users({ data, actorRole, onAction }) {
  const [dialog, setDialog] = useState(null);
  const selected = dialog || data.users[0];
  const confirmRole = () => { onAction({ type: "change_role", userId: selected.id, nextRole: "ADMIN" }); setDialog(null); };
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-02</p><h1>사용자 · 권한</h1><span>비식별 fixture 사용자만 표시합니다.</span></div>{canDo(actorRole, "change_role") && <Button kind="primary" onClick={() => setDialog(data.users[0])}>역할 변경</Button>}</div>
    <div className="admin-filter-row"><input aria-label="사용자 검색" placeholder="비식별 사용자 검색" /><span>역할: ADMIN</span><span>총 {data.users.length}명</span></div>
    <div className="admin-users-layout"><Section title="사용자 목록" className="admin-table-panel"><table><thead><tr><th>사용자</th><th>역할</th><th>상태</th><th>권한 범위</th><th>최근 변경</th><th>작업</th></tr></thead><tbody>{data.users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.id}</small></td><td><Chip>{user.role}</Chip></td><td><span className="admin-status-dot">● {user.status}</span></td><td>{user.scope}</td><td>{user.updated}</td><td>{canDo(actorRole, "change_role") && <Button onClick={() => setDialog(user)}>역할 변경</Button>}</td></tr>)}</tbody></table></Section><aside className="admin-user-side"><Section title="선택 사용자 상세"><div className="admin-user-detail"><b>{data.users[0].name}</b><span>{data.users[0].id}</span><dl><dt>현재 역할</dt><dd>ADMIN</dd><dt>권한 범위</dt><dd>관리자 기능</dd><dt>상태</dt><dd>활성</dd></dl><p>역할 변경은 실제 서버 통합 전까지 callback만 전송합니다.</p></div></Section><Section title="권한 요약"><div className="admin-role-summary"><p><Chip tone="green">ADMIN 3</Chip></p></div></Section></aside></div>
    {dialog && <Dialog title="역할 변경 확인" onClose={() => setDialog(null)}><p><b>{selected.name}</b>의 역할을 관리자로 변경할까요?</p><p className="admin-dialog-note">이 동작은 callback만 전송하며 실제 권한은 변경하지 않습니다.</p><div className="admin-dialog-actions"><Button onClick={() => setDialog(null)}>취소</Button><Button kind="primary" onClick={confirmRole}>변경 확인</Button></div></Dialog>}</>;
}

function Export({ data, actorRole, onAction }) {
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-03</p><h1>데이터 · Export</h1><span>원본 데이터는 브라우저에서 만들지 않습니다.</span></div>{canDo(actorRole, "export_request") && <Button kind="primary" onClick={() => onAction({ type: "export_request", exportType: "station_availability" })}>Export 요청</Button>}</div>
    <div className="admin-stat-grid"><StatCard label="Curated 상태" value="정상" note="fixture 배치 기준" icon="✓" tone="green" /><StatCard label="Coverage" value="98.7%" note="비운영 fixture" icon="◔" /><StatCard label="격리 항목" value="3건" note="검토 필요" icon="!" tone="orange" /><StatCard label="최근 배치" value="21:15" note="데이터 기준 시각" icon="◷" /></div>
    <div className="admin-dashboard-grid"><Section title="제한 Export 요청" action={<span className="admin-filter-hint">상태 · 전체</span>} className="admin-tall-panel"><table><thead><tr><th>작업 ID</th><th>데이터 유형</th><th>요청자</th><th>상태</th><th>진행률</th></tr></thead><tbody>{data.exports.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.type}</td><td>{item.requester}</td><td><Chip tone={item.state === "완료" ? "green" : item.state === "대기" ? "gray" : "blue"}>{item.state}</Chip></td><td><div className="admin-progress"><i style={{ width: `${item.progress}%` }} /><span>{item.progress}%</span></div></td></tr>)}</tbody></table></Section><Section title="요청 상세"><div className="admin-request-detail"><Chip tone="green">완료</Chip><dl><dt>작업 ID</dt><dd>EXP-240821-04</dd><dt>정책</dt><dd>민감 필드 제외 fixture</dd><dt>파일 형식</dt><dd>CSV (sample)</dd><dt>행 수</dt><dd>12,480</dd></dl><p>실제 파일 생성·다운로드는 후속 API 통합 범위입니다.</p></div></Section></div></>;
}

function Audit({ data }) {
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-04</p><h1>감사 로그</h1><span>비식별 행위 데이터만 보여 주는 fixture입니다.</span></div></div><div className="admin-filter-row"><select aria-label="기간 필터"><option>최근 7일</option></select><select aria-label="행위 필터"><option>전체 행위</option></select><select aria-label="결과 필터"><option>전체 결과</option></select><input aria-label="감사 로그 검색" placeholder="행위, 대상 검색" /></div><div className="admin-dashboard-grid"><Section title="정규화 감사 로그" className="admin-tall-panel"><AuditTable audit={data.audit} /></Section><Section title="안전한 표시 원칙"><div className="admin-safe-list"><p>✓ IP 원문을 표시하지 않습니다.</p><p>✓ 이메일·OAuth 값은 표시하지 않습니다.</p><p>✓ Q&A 본문을 표시하지 않습니다.</p><p>✓ 대상은 비식별 문자열입니다.</p></div></Section></div></>;
}

function ModelOps({ data, actorRole, onAction }) {
  const model = data.models[1];
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-05</p><h1>ModelOps</h1><span>실제 모델 실행·배포 없이 검토 흐름만 표현합니다.</span></div>{canDo(actorRole, "activate_model") && <Button kind="primary" onClick={() => onAction({ type: "activate_model", version: "v16" })}>활성화</Button>}</div><div className="admin-stat-grid"><StatCard label="등록 모델" value="3" note="fixture version" icon="◇" /><StatCard label="검증 대기" value="1" note="VALIDATED 전" icon="◷" tone="orange" /><StatCard label="현재 ACTIVE" value="v17" note="fixture 상태" icon="✓" tone="green" /></div><div className="admin-dashboard-grid"><Section title="모델 성능 비교" className="admin-tall-panel"><div className="admin-model-bars">{data.models.map((item, index) => <div key={item.version}><b>{item.version}</b><i style={{ height: `${Number(item.accuracy) * 100}%` }} className={index === 0 ? "active" : ""} /><span>{item.accuracy}</span></div>)}</div><div className="admin-model-flow"><Chip tone="gray">DRAFT</Chip><span>→</span><Chip>VALIDATED</Chip><span>→</span><Chip tone="purple">APPROVED</Chip><span>→</span><Chip tone="green">ACTIVE</Chip></div></Section><Section title="관리자 검토 작업"><ul className="admin-checklist"><li>관리자: 모델 검증 <Chip>검증</Chip></li><li>관리자: 승인 또는 거절 <Chip tone="purple">승인</Chip></li><li>관리자: 활성화·롤백 <Chip tone="green">활성화</Chip></li></ul><div className="admin-action-row">{canDo(actorRole, "validate_model") && <Button onClick={() => onAction({ type: "validate_model", version: model.version })}>검증</Button>}{canDo(actorRole, "approve_model") && <Button kind="primary" onClick={() => onAction({ type: "approve_model", version: model.version })}>승인</Button>}{canDo(actorRole, "rollback_model") && <Button onClick={() => onAction({ type: "rollback_model", version: "v17" })}>롤백</Button>}</div></Section></div></>;
}

function Qna({ data, actorRole, onAction }) {
  const [status, setStatus] = useState("전체 상태");
  const [selectedId, setSelectedId] = useState("Q-104");
  const selected = data.qna.find((item) => item.id === selectedId) || data.qna[0];
  const list = status === "전체 상태" ? data.qna : data.qna.filter((item) => item.state === status);
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-06</p><h1>Q&A 관리</h1><span>PRIVATE 문의 원문과 개인정보는 관리자 fixture에서 표시하지 않습니다.</span></div><Chip tone="orange">fixture · 답변 미전송</Chip></div><div className="admin-filter-row"><select aria-label="Q&A 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option>전체 상태</option><option>OPEN</option><option>ANSWERED</option><option>CLOSED</option><option>HIDDEN</option></select><select aria-label="공개 범위 필터"><option>전체 공개 범위</option><option>PUBLIC</option><option>PRIVATE</option></select></div><div className="admin-dashboard-grid admin-qna-grid"><Section title={`문의 목록 · ${list.length}건`} className="admin-tall-panel admin-qna-list"><table><thead><tr><th>분류</th><th>질문 제목</th><th>공개 범위</th><th>상태</th><th>최근 변경</th></tr></thead><tbody>{list.map((item) => <tr key={item.id} className={item.id === selected.id ? "is-selected" : ""} onClick={() => setSelectedId(item.id)}><td>{item.category}</td><td><button type="button" className="admin-table-link" onClick={() => setSelectedId(item.id)}>{item.title}</button></td><td><Chip tone={item.visibility === "PRIVATE" ? "purple" : "green"}>{item.visibility}</Chip></td><td><Chip tone={item.state === "OPEN" ? "orange" : "blue"}>{item.state}</Chip></td><td>{item.updated}</td></tr>)}</tbody></table></Section><aside className="admin-qna-side"><Section title="처리 현황"><div className="admin-qna-summary"><b>8</b><span>전체 fixture 문의</span><div><Chip tone="orange">OPEN 3</Chip><Chip>ANSWERED 2</Chip><Chip tone="gray">CLOSED 2</Chip></div></div></Section><Section title="문의 처리"><div className="admin-qna-detail"><Chip tone={selected.visibility === "PRIVATE" ? "purple" : "green"}>{selected.visibility}</Chip><h3>{selected.visibility === "PRIVATE" ? "비공개 문의" : selected.title}</h3><p>{selected.visibility === "PRIVATE" ? "원문은 숨김 처리되어 있습니다." : "fixture 문의 미리보기입니다. 실제 답변은 전송하지 않습니다."}</p><div className="admin-action-row">{canDo(actorRole, "answer_qna") && <Button kind="primary" onClick={() => onAction({ type: "answer_qna", questionId: selected.id })}>답변 보내기</Button>}{canDo(actorRole, "change_qna_state") && <Button onClick={() => onAction({ type: "change_qna_state", questionId: selected.id, nextState: "CLOSED" })}>종료</Button>}{canDo(actorRole, "hide_qna") && <Button onClick={() => onAction({ type: "hide_qna", questionId: selected.id, nextState: "HIDDEN" })}>숨김</Button>}</div></div></Section><Section title="PRIVATE 보호"><p className="admin-private-protection">PRIVATE 문의는 원문, 연락처, 식별 정보를 렌더링하지 않습니다. ADMIN만 HIDDEN callback을 보냅니다.</p></Section><Section title="상태 전이 가이드"><p className="admin-transition-guide"><b>OPEN</b> → <b>ANSWERED</b> → <b>CLOSED</b><br />ADMIN만 HIDDEN callback을 보낼 수 있습니다.</p></Section></aside></div></>;
}

function Dialog({ title, children, onClose }) { return <div className="admin-dialog-backdrop" role="presentation"><section className="admin-dialog" role="dialog" aria-modal="true" aria-label={title}><button type="button" className="admin-dialog-close" aria-label="닫기" onClick={onClose}>×</button><h2>{title}</h2>{children}</section></div>; }

export function AdminPage({ menuId, actorRole, fixtureData = fixture, onAction = () => {} }) {
  const pages = { dashboard: <Dashboard data={fixtureData} />, users: <Users data={fixtureData} actorRole={actorRole} onAction={onAction} />, export: <Export data={fixtureData} actorRole={actorRole} onAction={onAction} />, audit: <Audit data={fixtureData} />, modelops: <ModelOps data={fixtureData} actorRole={actorRole} onAction={onAction} />, qna: <Qna data={fixtureData} actorRole={actorRole} onAction={onAction} /> };
  return <div className="admin-page">{pages[menuId] || pages.dashboard}</div>;
}
