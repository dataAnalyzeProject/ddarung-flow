import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import ReasonDialog from '../../components/ReasonDialog';
import { createLiveSystemAccessAdapter } from './systemAccessAdapter';
import './systemAccess.css';

const PAGE_SIZE = 20;
const SORT = 'displayName,asc';
const DIFF_LABELS = { ADDED: '추가', REMOVED: '제거', EXPIRY_EXTENDED: '만료 연장/추가', EXPIRY_REDUCED: '만료 단축', UNCHANGED: '변경 없음' };
const HIGH_RISK_ROLE_CODES = new Set(['OPS_MANAGER', 'MODEL_APPROVER', 'ACCESS_ADMIN', 'SUPER_ADMIN']);
function isHighRiskRole(role) { return Boolean(role && (HIGH_RISK_ROLE_CODES.has(role.roleCode) || role.protectedRole || role.systemRole)); }

function normalizeReason(value) { return value.replace(/\s+/g, ' ').trim(); }
function sameInstant(left, right) { return left === right || (left && right && new Date(left).getTime() === new Date(right).getTime()); }
function toInputTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function toIso(value) { return value ? new Date(value).toISOString() : null; }
function formatTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '만료 없음'; }
function errorState(error) { return error?.status === 401 || error?.status === 403 ? 'FORBIDDEN' : 'ERROR'; }

export function classifyAssignments(current = [], requested = []) {
  const before = new Map(current.map((assignment) => [assignment.roleCode, assignment.expiresAt || null]));
  const after = new Map(requested.map((assignment) => [assignment.roleCode, assignment.expiresAt || null]));
  const changes = [];
  after.forEach((expiresAt, roleCode) => {
    if (!before.has(roleCode)) changes.push({ roleCode, type: 'ADDED' });
    else if (!sameInstant(before.get(roleCode), expiresAt)) {
      const previous = before.get(roleCode);
      changes.push({ roleCode, type: previous && (!expiresAt || new Date(expiresAt) > new Date(previous)) ? 'EXPIRY_EXTENDED' : 'EXPIRY_REDUCED' });
    } else changes.push({ roleCode, type: 'UNCHANGED' });
  });
  before.forEach((_, roleCode) => { if (!after.has(roleCode)) changes.push({ roleCode, type: 'REMOVED' }); });
  return changes;
}

export function permissionImpact(current = [], requested = [], catalog = []) {
  const permissionsFor = (assignments) => new Set(assignments.flatMap(({ roleCode }) => catalog.find((role) => role.roleCode === roleCode)?.permissions || []));
  const before = permissionsFor(current); const after = permissionsFor(requested);
  return { gained: [...after].filter((permission) => !before.has(permission)).sort(), lost: [...before].filter((permission) => !after.has(permission)).sort() };
}

function AssignmentDiff({ changes, catalog }) {
  return <ul className="system-access-diff">{changes.map((change) => <li key={change.roleCode}><strong>{catalog.find((role) => role.roleCode === change.roleCode)?.displayName || change.roleCode}</strong><span>{DIFF_LABELS[change.type]}</span></li>)}</ul>;
}

function DetailPanel({ detail, catalog, access, onSave, onRefresh, mutation }) {
  const [requested, setRequested] = useState([]);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const current = useMemo(() => detail?.adminRoles || [], [detail]);
  useEffect(() => { setRequested(current.map((role) => ({ roleCode: role.roleCode, expiresAt: role.expiresAt || null }))); setReason(''); setConfirming(false); }, [detail, current]);
  if (!detail) return <section className="system-access-card" aria-label="선택된 사용자"><p>목록에서 사용자를 선택하면 현재 역할과 요청 역할을 비교할 수 있습니다.</p></section>;

  const changes = classifyAssignments(current, requested);
  const impact = permissionImpact(current, requested, catalog);
  const canAssign = access.permissions?.includes('ACCESS_ASSIGN');
  const canRevoke = access.permissions?.includes('ACCESS_REVOKE');
  const needsAssign = changes.some((change) => ['ADDED', 'EXPIRY_EXTENDED'].includes(change.type));
  const needsRevoke = changes.some((change) => ['REMOVED', 'EXPIRY_REDUCED'].includes(change.type));
  const noChanges = changes.every((change) => change.type === 'UNCHANGED');
  const invalidExpiry = requested.some((role) => role.expiresAt && new Date(role.expiresAt) <= new Date());
  const normalizedReason = normalizeReason(reason);
  const blocked = noChanges || invalidExpiry || normalizedReason.length < 2 || normalizedReason.length > 200 || (needsAssign && !canAssign) || (needsRevoke && !canRevoke) || mutation.state === 'SUBMITTING';
  const currentHighRisk = current.filter(({ roleCode }) => isHighRiskRole(catalog.find((role) => role.roleCode === roleCode)));
  const highRiskChange = changes.some((change) => change.type !== 'UNCHANGED' && isHighRiskRole(catalog.find((role) => role.roleCode === change.roleCode)));
  const toggleRole = (roleCode, checked) => setRequested((previous) => checked ? [...previous, { roleCode, expiresAt: null }] : previous.filter((role) => role.roleCode !== roleCode));
  const setExpiry = (roleCode, value) => setRequested((previous) => previous.map((role) => role.roleCode === roleCode ? { ...role, expiresAt: toIso(value) } : role));
  const submit = () => { setConfirming(false); onSave({ expectedVersion: detail.version, assignments: requested, reason: normalizedReason }); };

  return <section className="system-access-card" aria-label="선택된 사용자 역할 편집">
    <header><h2>{detail.displayName}</h2><dl className="system-access-summary"><div><dt>계정 유형</dt><dd>{detail.accountRole}</dd></div><div><dt>보호 상태</dt><dd>{detail.protectedUser ? '보호됨' : '보호 정보 없음'}</dd></div><div><dt>고위험 역할</dt><dd>{currentHighRisk.length ? currentHighRisk.map(({ roleCode }) => catalog.find((role) => role.roleCode === roleCode)?.displayName || roleCode).join(', ') : '없음'}</dd></div><div><dt>현재 버전</dt><dd>{detail.version}</dd></div></dl></header>
    {detail.accountRole === 'USER' ? <p className="system-access-warning">이 계정은 USER입니다. 서버가 관리자 역할 부여를 제한하면 변경할 수 없습니다.</p> : null}
    <fieldset><legend>요청할 관리자 역할 전체</legend>{catalog.map((role) => {
      const assignment = requested.find((item) => item.roleCode === role.roleCode);
      return <div className="system-access-role" key={role.roleCode}><label><input type="checkbox" aria-label={`${role.displayName} 역할`} checked={Boolean(assignment)} onChange={(event) => toggleRole(role.roleCode, event.target.checked)} /> {role.displayName}</label><p>{role.description}</p>{assignment ? <label>만료 시각<input type="datetime-local" aria-label={`${role.displayName} 만료 시각`} value={toInputTime(assignment.expiresAt)} onChange={(event) => setExpiry(role.roleCode, event.target.value)} /><span>{assignment.expiresAt ? formatTime(assignment.expiresAt) : '만료 없음'}</span></label> : null}{(role.protectedRole || role.systemRole) ? <small>보호 또는 시스템 역할: 변경 전 확인이 필요합니다.</small> : null}</div>;
    })}</fieldset>
    {invalidExpiry ? <p role="alert" className="system-access-error">만료 시각은 현재보다 이후여야 합니다.</p> : null}
    <section aria-labelledby="requested-diff"><h3 id="requested-diff">현재 역할과 요청 역할 비교</h3><AssignmentDiff changes={changes} catalog={catalog} /></section>
    <section aria-labelledby="permission-impact"><h3 id="permission-impact">권한 영향</h3><p>획득: {impact.gained.length ? impact.gained.join(', ') : '없음'}</p><p>상실: {impact.lost.length ? impact.lost.join(', ') : '없음'}</p></section>
    {needsAssign && !canAssign ? <p className="system-access-error">ACCESS_ASSIGN 권한이 없어 부여 또는 만료 연장을 요청할 수 없습니다.</p> : null}
    {needsRevoke && !canRevoke ? <p className="system-access-error">ACCESS_REVOKE 권한이 없어 회수 또는 만료 단축을 요청할 수 없습니다.</p> : null}
    {highRiskChange ? <p className="system-access-warning">고위험 역할의 변경입니다. 서버의 마지막 SUPER_ADMIN 및 자기 보호 검증이 적용됩니다.</p> : null}
    <label className="system-access-reason">변경 사유<textarea aria-label="변경 사유" value={reason} onChange={(event) => setReason(event.target.value)} minLength="2" maxLength="200" required /><small>{normalizedReason.length}/200자</small></label>
    {noChanges ? <p>변경 없음: 저장 요청을 보내지 않습니다.</p> : null}
    <button type="button" onClick={() => setConfirming(true)} disabled={blocked}>{mutation.state === 'SUBMITTING' ? '저장 중' : '변경 검토 및 저장'}</button>
    {mutation.state === 'SUCCESS' ? <p role="status">역할 정보를 새로 고쳤습니다.</p> : null}
    {mutation.state === 'CONFLICT' ? <div role="alert" className="system-access-error"><p>현재 역할 정보가 변경되었습니다. 최신 정보를 다시 불러온 뒤 요청을 다시 확인하세요.</p><button type="button" onClick={onRefresh}>최신 역할 다시 불러오기</button></div> : null}
    {mutation.state === 'ERROR' ? <p role="alert" className="system-access-error">{mutation.error?.code || '역할 변경에 실패했습니다.'}</p> : null}
    <ReasonDialog open={confirming} title="역할 변경 확인" onClose={() => setConfirming(false)}><p>아래 요청 전체 역할 집합으로 변경합니다. 서버가 최종 권한과 보호 규칙을 검사합니다.</p><AssignmentDiff changes={changes.filter((change) => change.type !== 'UNCHANGED')} catalog={catalog} /><button type="button" onClick={submit}>변경 요청 보내기</button></ReasonDialog>
  </section>;
}

export default function SystemAccessPage({ createAdapter = createLiveSystemAccessAdapter }) {
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const [pageData, setPageData] = useState(null); const [page, setPage] = useState(0); const [query, setQuery] = useState(''); const [appliedQuery, setAppliedQuery] = useState('');
  const [pageError, setPageError] = useState(null); const [loading, setLoading] = useState(true); const [selectedId, setSelectedId] = useState(null); const [detail, setDetail] = useState(null); const [detailError, setDetailError] = useState(null); const [detailLoading, setDetailLoading] = useState(false); const [mutation, setMutation] = useState({ state: 'IDLE' });
  const pageGeneration = useRef(0); const detailGeneration = useRef(0); const selectedIdRef = useRef(null); const detailController = useRef(null);
  useEffect(() => { const controller = new AbortController(); const generation = ++pageGeneration.current; setLoading(true); setPageError(null); adapter.loadPage({ page, size: PAGE_SIZE, sort: SORT, q: appliedQuery, signal: controller.signal }).then((next) => { if (!controller.signal.aborted && generation === pageGeneration.current) setPageData(next); }).catch((error) => { if (!controller.signal.aborted && generation === pageGeneration.current) setPageError(error); }).finally(() => { if (!controller.signal.aborted && generation === pageGeneration.current) setLoading(false); }); return () => controller.abort(); }, [adapter, page, appliedQuery]);
  useEffect(() => () => detailController.current?.abort(), []);
  const loadDetail = (publicUserId, clearCurrent = true) => {
    detailController.current?.abort();
    selectedIdRef.current = publicUserId;
    setSelectedId(publicUserId);
    if (clearCurrent) setDetail(null);
    setDetailError(null);
    const controller = new AbortController();
    detailController.current = controller;
    const generation = ++detailGeneration.current;
    setDetailLoading(true);
    adapter.loadUser(publicUserId, { signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted && generation === detailGeneration.current) { setDetail(next); setMutation({ state: 'IDLE' }); } })
      .catch((error) => { if (!controller.signal.aborted && generation === detailGeneration.current) setDetailError(error); })
      .finally(() => { if (!controller.signal.aborted && generation === detailGeneration.current) { detailController.current = null; setDetailLoading(false); } });
  };
  const selectUser = (publicUserId) => { setMutation({ state: 'IDLE' }); loadDetail(publicUserId); };
  const save = (body) => { if (!selectedId || mutation.state === 'SUBMITTING') return; const stableId = selectedId; setMutation({ state: 'SUBMITTING' }); adapter.replaceRoles(stableId, body).then(() => {
    if (selectedIdRef.current !== stableId) return null;
    return adapter.loadUser(stableId);
  }).then((fresh) => { if (fresh && selectedIdRef.current === stableId) { setDetail(fresh); setPageData((previous) => previous ? { ...previous, users: { ...previous.users, items: previous.users.items.map((user) => user.userId === stableId ? { ...user, adminRoles: fresh.adminRoles, protectedUser: fresh.protectedUser, version: fresh.version } : user) } } : previous); setMutation({ state: 'SUCCESS' }); } }).catch((error) => { if (selectedIdRef.current !== stableId) return; setMutation({ state: error.code === 'ROLE_ASSIGNMENT_VERSION_CONFLICT' ? 'CONFLICT' : 'ERROR', error }); }); };
  const submitSearch = (event) => { event.preventDefault(); setPage(0); setAppliedQuery(query.trim()); };
  const users = pageData?.users?.items || []; const catalog = pageData?.roles || [];
  return <main className="system-access-page"><header className="system-access-header"><p>UI-SYS-02</p><h1>관리자 역할·권한</h1><p>사용자의 전체 관리자 역할 집합과 권한 영향을 확인한 뒤 변경을 요청합니다.</p></header>
    {loading ? <AsyncStatePanel state="LOADING" /> : null}{!loading && pageError ? <AsyncStatePanel state={errorState(pageError)} code={pageError.code} requiredPermission={pageError.status === 403 ? 'ACCESS_READ' : undefined} /> : null}
    {!loading && !pageError ? <div className="system-access-layout"><section className="system-access-card" aria-label="사용자 목록"><form onSubmit={submitSearch}><label>사용자 검색<input value={query} onChange={(event) => setQuery(event.target.value)} /></label><button type="submit">검색</button></form>{users.length ? <ul className="system-access-users">{users.map((user) => <li key={user.userId}><button type="button" aria-pressed={selectedId === user.userId} onClick={() => selectUser(user.userId)}>{user.displayName}<span>{user.role}</span></button></li>)}</ul> : <p>표시할 사용자가 없습니다.</p>}<nav aria-label="사용자 목록 페이지"><button type="button" disabled={page <= 0} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page + 1}페이지</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= (pageData?.users?.total || 0)} onClick={() => setPage((value) => value + 1)}>다음</button></nav></section><div>{!selectedId ? <DetailPanel /> : null}{detailLoading ? <AsyncStatePanel state="LOADING" /> : null}{detailError ? <AsyncStatePanel state={errorState(detailError)} code={detailError.code} requiredPermission={detailError.status === 403 ? 'ACCESS_READ' : undefined} /> : null}{detail ? <DetailPanel detail={detail} catalog={catalog} access={pageData.access || { permissions: [] }} onSave={save} onRefresh={() => loadDetail(selectedId, false)} mutation={mutation} /> : null}</div></div> : null}
  </main>;
}
