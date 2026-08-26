import { useCallback, useEffect, useState } from "react";
import { canDo, fixture } from "./adminFixture";
import { answerQuestion, hideQuestion, listAdminQuestions } from "./qnaAdminApi";
import { changeAdminUserRole, listAdminUsers } from "./adminUsersApi";
import { listAdminAuditLogs } from "./adminAuditLogsApi";
import { QnaAnswerDetail } from "./AdminDetailViews";
import { createAdminExport, downloadAdminExport, listAdminExports } from "./adminExportsApi";

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
    loading: ["불러오는 중", "관리자 데이터를 준비하고 있습니다."],
    empty: ["표시할 항목이 없습니다", "필터를 조정하거나 다시 시도해 주세요."],
    error: ["일시적으로 표시할 수 없습니다", "잠시 후 다시 시도해 주세요."],
    forbidden: ["관리자 권한이 필요합니다", "관리자 데이터와 카드, 표는 표시하지 않습니다."],
    unauthorized: ["로그인이 필요합니다", "로그인 후 다시 시도해 주세요."],
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

function Users() {
  const [items, setItems] = useState([]); const [query, setQuery] = useState(""); const [state, setState] = useState("loading");
  const [dialog, setDialog] = useState(null); const [nextRole, setNextRole] = useState("USER"); const [reason, setReason] = useState(""); const [actionError, setActionError] = useState("");
  const load = useCallback((nextQuery = "") => { setState("loading"); listAdminUsers({ q: nextQuery }).then((page) => { setItems(page.items); setState(page.items.length ? "success" : "empty"); }).catch((error) => setState(error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : "error")); }, []);
  useEffect(() => { load(); }, [load]);
  if (state !== "success") return <><AdminStatePanel state={state} /><div className="admin-action-row"><Button onClick={() => load()}>다시 시도</Button></div></>;
  const openDialog = (user) => { setDialog(user); setNextRole(user.role === "ADMIN" ? "USER" : "ADMIN"); setReason(""); setActionError(""); };
  const confirmRole = async () => { try { await changeAdminUserRole(dialog.userId, nextRole, reason); setDialog(null); load(); } catch (error) { setActionError(error.code === "LAST_SUPER_ADMIN_REQUIRED" ? "마지막 ADMIN의 역할은 낮출 수 없습니다." : error.status === 404 ? "사용자를 찾을 수 없습니다." : "역할 변경에 실패했습니다."); } };
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-02</p><h1>사용자 · 권한</h1><span>실제 API의 공개 UUID, 표시 이름, 역할만 표시합니다.</span></div></div>
    <form className="admin-filter-row" onSubmit={(event) => { event.preventDefault(); load(query); }}><input aria-label="사용자 검색" placeholder="표시 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><Button kind="primary" onClick={() => load(query)}>검색</Button><span>총 {items.length}명</span></form>
    <div className="admin-users-layout"><Section title="사용자 목록" className="admin-table-panel"><table><thead><tr><th>사용자</th><th>역할</th><th>작업</th></tr></thead><tbody>{items.map((user) => <tr key={user.userId}><td><strong>{user.displayName}</strong><small>{user.userId}</small></td><td><Chip>{user.role}</Chip></td><td><Button onClick={() => openDialog(user)}>역할 변경</Button></td></tr>)}</tbody></table></Section><aside className="admin-user-side"><Section title="안전한 표시 원칙"><div className="admin-safe-list"><p>✓ 이메일은 표시하지 않습니다.</p><p>✓ OAuth 식별자는 표시하지 않습니다.</p><p>✓ 내부 숫자 ID는 표시하지 않습니다.</p></div></Section></aside></div>
    {dialog && <Dialog title="역할 변경 확인" onClose={() => setDialog(null)}><p><b>{dialog.displayName}</b>의 역할을 변경합니다.</p><label>새 역할<select aria-label="새 역할" value={nextRole} onChange={(event) => setNextRole(event.target.value)}><option value="USER">USER</option><option value="ADMIN">ADMIN</option></select></label><label>변경 사유<textarea aria-label="변경 사유" value={reason} onChange={(event) => setReason(event.target.value)} /></label>{actionError && <p role="alert">{actionError}</p>}<div className="admin-dialog-actions"><Button onClick={() => setDialog(null)}>취소</Button><Button kind="primary" disabled={reason.trim().length < 2 || reason.trim().length > 200} onClick={confirmRole}>변경 확인</Button></div></Dialog>}</>;
}

function Export({ actorRole }) {
  const [items, setItems] = useState([]); const [state, setState] = useState("loading"); const [source, setSource] = useState("CURATED"); const [format, setFormat] = useState("CSV"); const [purpose, setPurpose] = useState(""); const [rowCount, setRowCount] = useState("1000"); const [actionError, setActionError] = useState(""); const [downloading, setDownloading] = useState(null);
  const load = useCallback(() => { setState("loading"); listAdminExports().then((page) => { setItems(page.items); setState(page.items.length ? "success" : "empty"); }).catch((error) => setState(error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : "error")); }, []);
  useEffect(() => { load(); }, [load]);
  const requestExport = async () => { setActionError(""); try { await createAdminExport({ source, format, purpose: purpose.trim() || null, rowCount: Number(rowCount) }); load(); } catch (error) { setActionError(error.code === "VALIDATION_ERROR" ? "입력값 또는 행 수 상한을 확인해 주세요." : "Export 생성에 실패했습니다."); } };
  const download = async (item) => { setActionError(""); setDownloading(item.exportId); try { const blob = await downloadAdminExport(item.exportId); if (typeof URL.createObjectURL === "function") { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `export-${item.exportId}`; link.click(); URL.revokeObjectURL(url); } } catch (error) { setActionError(error.code === "EXPORT_EXPIRED" ? "다운로드 기간이 만료되었습니다." : "다운로드 파일을 찾을 수 없습니다."); } finally { setDownloading(null); } };
  if (state !== "success" && state !== "empty") return <><AdminStatePanel state={state} /><div className="admin-action-row"><Button onClick={load}>다시 시도</Button></div></>;
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-03</p><h1>데이터 · Export</h1><span>서버가 생성한 비식별 데이터만 내려받습니다.</span></div></div>
    <Section title="제한 Export 요청" className="admin-tall-panel"><div className="admin-filter-row"><select aria-label="Export 원본" value={source} onChange={(event) => setSource(event.target.value)}><option value="CURATED">CURATED</option><option value="QUARANTINE_NORMALIZED">QUARANTINE_NORMALIZED</option></select><select aria-label="Export 형식" value={format} onChange={(event) => setFormat(event.target.value)}><option value="CSV">CSV</option><option value="PARQUET">Parquet</option></select><input aria-label="Export 목적" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="사용 목적" /><input aria-label="Export 행 수" type="number" min="0" value={rowCount} onChange={(event) => setRowCount(event.target.value)} />{canDo(actorRole, "export_request") && <Button kind="primary" onClick={requestExport}>Export 요청</Button>}</div>{actionError && <p role="alert">{actionError}</p>}{state === "empty" ? <><AdminStatePanel state="empty" /><div className="admin-action-row"><Button onClick={load}>다시 시도</Button></div></> : <table><thead><tr><th>요청</th><th>원본</th><th>형식</th><th>상태</th><th>행 수</th><th>작업</th></tr></thead><tbody>{items.map((item) => <tr key={item.exportId}><td>{item.exportId}</td><td>{item.source}</td><td>{item.format}</td><td><Chip tone={item.status === "COMPLETED" ? "green" : "blue"}>{item.status}</Chip></td><td>{item.rowCount ?? "-"}</td><td>{item.status === "COMPLETED" && <Button onClick={() => download(item)} disabled={downloading === item.exportId}>{downloading === item.exportId ? "다운로드 준비 중" : "다운로드"}</Button>}</td></tr>)}</tbody></table>}</Section></>;
}

function Audit() {
  const [filters, setFilters] = useState({ action: "", result: "", reasonCode: "", from: "", to: "" });
  const [page, setPage] = useState(0); const [resultPage, setResultPage] = useState(null); const [state, setState] = useState("loading");
  const load = useCallback((nextPage, nextFilters) => { setState("loading"); listAdminAuditLogs({ ...nextFilters, page: nextPage }).then((response) => { setResultPage(response); setPage(nextPage); setState(response.items.length ? "success" : "empty"); }).catch((error) => setState(error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : "error")); }, []);
  useEffect(() => { load(0, { action: "", result: "", reasonCode: "", from: "", to: "" }); }, [load]);
  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  const stateText = { loading: "감사 로그를 불러오는 중입니다.", empty: "조건에 맞는 감사 로그가 없습니다.", unauthorized: "로그인이 필요합니다.", forbidden: "관리자 권한이 필요합니다.", error: "감사 로그를 표시할 수 없습니다." };
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-04</p><h1>감사 로그</h1><span>실제 API의 비식별 감사 행만 표시합니다.</span></div></div><form className="admin-filter-row" onSubmit={(event) => { event.preventDefault(); load(0, filters); }}><input aria-label="행위 필터" placeholder="행위" value={filters.action} onChange={(event) => updateFilter("action", event.target.value)} /><select aria-label="결과 필터" value={filters.result} onChange={(event) => updateFilter("result", event.target.value)}><option value="">전체 결과</option><option value="SUCCESS">성공</option><option value="FAILURE">실패</option></select><input aria-label="사유 코드 필터" placeholder="사유 코드" value={filters.reasonCode} onChange={(event) => updateFilter("reasonCode", event.target.value)} /><input aria-label="시작 시각" type="datetime-local" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /><input aria-label="종료 시각" type="datetime-local" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /><Button kind="primary" onClick={() => load(0, filters)}>조회</Button></form>{state !== "success" ? <><section className="admin-state-panel" aria-live="polite"><h1>{stateText[state]}</h1></section><div className="admin-action-row"><Button onClick={() => load(page, filters)}>다시 시도</Button></div></> : <div className="admin-dashboard-grid"><Section title="정규화 감사 로그" className="admin-tall-panel"><table><thead><tr><th>시각</th><th>행위</th><th>사용자 역할</th><th>대상</th><th>결과</th></tr></thead><tbody>{resultPage.items.map((item) => <tr key={`${item.correlationId}-${item.occurredAt}`}><td>{item.occurredAt}</td><td><strong>{item.action}</strong></td><td>{item.actorRole}</td><td>{item.targetType} · {item.targetId}</td><td><Chip tone={item.result === "SUCCESS" ? "green" : "coral"}>{item.result}</Chip></td></tr>)}</tbody></table><div className="admin-action-row"><Button disabled={page === 0} onClick={() => load(page - 1, filters)}>이전</Button><span>{page + 1} 페이지</span><Button disabled={(page + 1) * resultPage.size >= resultPage.total} onClick={() => load(page + 1, filters)}>다음</Button></div></Section><Section title="안전한 표시 원칙"><div className="admin-safe-list"><p>✓ IP 원문을 표시하지 않습니다.</p><p>✓ 이메일·OAuth 값은 표시하지 않습니다.</p><p>✓ Q&A 본문을 표시하지 않습니다.</p><p>✓ 대상은 비식별 문자열입니다.</p></div></Section></div>}</>;
}

function ModelOps({ data, actorRole, onAction }) {
  const model = data.models[1];
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-05</p><h1>ModelOps</h1><span>실제 모델 실행·배포 없이 검토 흐름만 표현합니다.</span></div>{canDo(actorRole, "activate_model") && <Button kind="primary" onClick={() => onAction({ type: "activate_model", version: "v16" })}>활성화</Button>}</div><div className="admin-stat-grid"><StatCard label="등록 모델" value="3" note="fixture version" icon="◇" /><StatCard label="검증 대기" value="1" note="VALIDATED 전" icon="◷" tone="orange" /><StatCard label="현재 ACTIVE" value="v17" note="fixture 상태" icon="✓" tone="green" /></div><div className="admin-dashboard-grid"><Section title="모델 성능 비교" className="admin-tall-panel"><div className="admin-model-bars">{data.models.map((item, index) => <div key={item.version}><b>{item.version}</b><i style={{ height: `${Number(item.accuracy) * 100}%` }} className={index === 0 ? "active" : ""} /><span>{item.accuracy}</span></div>)}</div><div className="admin-model-flow"><Chip tone="gray">DRAFT</Chip><span>→</span><Chip>VALIDATED</Chip><span>→</span><Chip tone="purple">APPROVED</Chip><span>→</span><Chip tone="green">ACTIVE</Chip></div></Section><Section title="관리자 검토 작업"><ul className="admin-checklist"><li>관리자: 모델 검증 <Chip>검증</Chip></li><li>관리자: 승인 또는 거절 <Chip tone="purple">승인</Chip></li><li>관리자: 활성화·롤백 <Chip tone="green">활성화</Chip></li></ul><div className="admin-action-row">{canDo(actorRole, "validate_model") && <Button onClick={() => onAction({ type: "validate_model", version: model.version })}>검증</Button>}{canDo(actorRole, "approve_model") && <Button kind="primary" onClick={() => onAction({ type: "approve_model", version: model.version })}>승인</Button>}{canDo(actorRole, "rollback_model") && <Button onClick={() => onAction({ type: "rollback_model", version: "v17" })}>롤백</Button>}</div></Section></div></>;
}

function Qna({ actorRole }) {
  const [items, setItems] = useState([]); const [selectedId, setSelectedId] = useState(null); const [state, setState] = useState("loading"); const [answer, setAnswer] = useState("");
  const load = () => { setState("loading"); listAdminQuestions().then((page) => { setItems(page.items); setSelectedId((id) => id || page.items[0]?.id); setState(page.items.length ? "success" : "empty"); }).catch(() => setState("error")); };
  const [detailId, setDetailId] = useState(null); useEffect(load, []); const selected = items.find((item) => item.id === selectedId); const detail = items.find((item) => item.id === detailId);
  if (state !== "success") return <AdminStatePanel state={state} />;
  const submitAnswer = async () => { if (!answer.trim()) return; try { await answerQuestion(selected.id, answer); setAnswer(""); load(); } catch { setState("error"); } };
  if (detail) return <QnaAnswerDetail question={detail} answer={answer} onAnswerChange={setAnswer} onAnswer={submitAnswer} onHide={() => hideQuestion(detail.id).then(() => { setDetailId(null); load(); }).catch(() => setState("error"))} onBack={() => setDetailId(null)} />;
  return <><div className="admin-page-title"><div><p className="admin-eyebrow">UI-ADMIN-06</p><h1>Q&A 관리</h1><span>실제 Q&A API를 통해 처리합니다.</span></div></div><div className="admin-dashboard-grid admin-qna-grid"><Section title={`문의 목록 · ${items.length}건`} className="admin-tall-panel admin-qna-list"><table><thead><tr><th>분류</th><th>질문 제목</th><th>공개 범위</th><th>상태</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={item.id === selected?.id ? "is-selected" : ""}><td>{item.category}</td><td><button type="button" className="admin-table-link" onClick={() => { setSelectedId(item.id); setDetailId(item.id); }}>{item.title}</button></td><td><Chip tone={item.visibility === "PRIVATE" ? "purple" : "green"}>{item.visibility}</Chip></td><td><Chip>{item.status === "PENDING" ? "OPEN" : item.status}</Chip></td></tr>)}</tbody></table></Section>{selected && <aside className="admin-qna-side"><Section title="문의 처리"><div className="admin-qna-detail"><Chip>{selected.visibility}</Chip><h3>{selected.title}</h3><p>{selected.body}</p><textarea aria-label="답변 내용" value={answer} onChange={(event) => setAnswer(event.target.value)} /><div className="admin-action-row">{!selected.answers?.length && <Button kind="primary" onClick={submitAnswer}>답변 보내기</Button>}<Button onClick={() => hideQuestion(selected.id).then(load).catch(() => setState("error"))}>숨김</Button></div></div></Section></aside>}</div></>;
}

function Dialog({ title, children, onClose }) { return <div className="admin-dialog-backdrop" role="presentation"><section className="admin-dialog" role="dialog" aria-modal="true" aria-label={title}><button type="button" className="admin-dialog-close" aria-label="닫기" onClick={onClose}>×</button><h2>{title}</h2>{children}</section></div>; }

export function AdminPage({ menuId, actorRole, fixtureData = fixture, onAction = () => {} }) {
  const pages = { dashboard: <Dashboard data={fixtureData} />, users: <Users />, export: <Export actorRole={actorRole} />, audit: <Audit />, modelops: <ModelOps data={fixtureData} actorRole={actorRole} onAction={onAction} />, qna: <Qna data={fixtureData} actorRole={actorRole} onAction={onAction} /> };
  return <div className="admin-page">{pages[menuId] || pages.dashboard}</div>;
}
