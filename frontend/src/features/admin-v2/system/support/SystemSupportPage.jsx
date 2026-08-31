import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import { createSystemSupportAdapter } from './systemSupportAdapter';

const EMPTY_FILTERS = { category: '', status: '', visibility: '' };
function isAccessError(error) { return error?.status === 401 || error?.status === 403; }
function formatTime(value) { return new Date(value).toLocaleString('ko-KR'); }
function options(items, field) { return [...new Set(items.map((item) => item[field]))].sort(); }
function filteredItems(items, filters) { return items.filter((item) => Object.entries(filters).every(([field, value]) => !value || item[field] === value)); }
function Filter({ label, name, value, values, onChange, disabled }) { return <label className="system-support-filter">{label}<select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(name, event.target.value)}><option value="">전체</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>; }

export default function SystemSupportPage({ createAdapter = createSystemSupportAdapter }) {
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const [result, setResult] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [selectedKey, setSelectedKey] = useState(null); const [answerBody, setAnswerBody] = useState('');
  const [actionPending, setActionPending] = useState(null); const [actionError, setActionError] = useState(null); const [reloadVersion, setReloadVersion] = useState(0); const generation = useRef(0); const actionController = useRef(null); const mounted = useRef(true);
  useEffect(() => {
    const controller = new AbortController(); const current = ++generation.current;
    setLoading(true); setError(null);
    adapter.load({ signal: controller.signal }).then((next) => { if (!controller.signal.aborted && generation.current === current) setResult(next); }).catch((nextError) => { if (!controller.signal.aborted && nextError?.name !== 'AbortError' && generation.current === current) setError(nextError); }).finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => controller.abort();
  }, [adapter, reloadVersion]);
  useEffect(() => () => { mounted.current = false; actionController.current?.abort(); }, []);
  const items = result?.items || []; const visibleItems = filteredItems(items, filters); const selected = visibleItems.find((item) => item.key === selectedKey) || null; const permissions = result?.permissions || [];
  const canAnswer = permissions.includes('QNA_ANSWER'); const canHide = permissions.includes('QNA_HIDE');
  const updateFilter = (name, value) => { setFilters((current) => ({ ...current, [name]: value })); setSelectedKey(null); setAnswerBody(''); };
  const select = (key) => { setSelectedKey(key); setAnswerBody(''); setActionError(null); };
  const runAction = async (type) => {
    if (!selected || actionPending) return;
    if (type === 'hide' && !window.confirm('이 문의를 숨길까요?')) return;
    const controller = new AbortController(); actionController.current = controller;
    setActionPending(type); setActionError(null);
    try {
      if (type === 'answer') await adapter.answer(selected.key, answerBody.trim(), { signal: controller.signal }); else await adapter.hide(selected.key, { signal: controller.signal });
      if (!controller.signal.aborted && mounted.current) { setAnswerBody(''); setReloadVersion((version) => version + 1); }
    } catch (nextError) {
      if (!controller.signal.aborted && mounted.current) setActionError(nextError);
    } finally {
      if (!controller.signal.aborted && mounted.current) setActionPending(null);
      if (actionController.current === controller) actionController.current = null;
    }
  };
  if (loading && !result) return <main className="system-support-page"><p className="system-support-eyebrow">UI-SYS-01</p><AsyncStatePanel state="LOADING" /></main>;
  if (error && !result) return <main className="system-support-page"><AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'QNA_READ' : undefined} />{!isAccessError(error) ? <button type="button" onClick={() => setReloadVersion((version) => version + 1)}>다시 시도</button> : null}</main>;
  return <main className="system-support-page" aria-label="사용자 문의">
    <header className="system-support-header"><p className="system-support-eyebrow">UI-SYS-01</p><h1>사용자 문의</h1><p>문의 내용을 확인하고 허용된 권한에서만 처리합니다.</p></header>
    <section className="system-support-filters" aria-label="문의 필터"><Filter label="분류" name="category" value={filters.category} values={options(items, 'category')} onChange={updateFilter} disabled={Boolean(actionPending)} /><Filter label="상태" name="status" value={filters.status} values={options(items, 'status')} onChange={updateFilter} disabled={Boolean(actionPending)} /><Filter label="공개 범위" name="visibility" value={filters.visibility} values={options(items, 'visibility')} onChange={updateFilter} disabled={Boolean(actionPending)} /></section>
    {loading ? <AsyncStatePanel state="LOADING" /> : null}{error ? <section className="system-support-inline-error"><AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'QNA_READ' : undefined} />{!isAccessError(error) ? <button type="button" onClick={() => setReloadVersion((version) => version + 1)}>다시 시도</button> : null}</section> : null}
    {!loading && !error && items.length === 0 ? <AsyncStatePanel state="EMPTY" /> : null}{!loading && !error && items.length > 0 && visibleItems.length === 0 ? <p className="system-support-empty-filter">선택한 필터에 맞는 문의가 없습니다.</p> : null}
    {!error && items.length > 0 && visibleItems.length > 0 ? <section className={`system-support-layout${selected ? ' system-support-layout--detail' : ''}`}>
      <section className="system-support-list" aria-label="문의 목록"><h2>문의 목록</h2><ul>{visibleItems.map((item) => <li key={item.key}><button type="button" disabled={Boolean(actionPending)} aria-current={item.key === selectedKey ? 'true' : undefined} onClick={() => select(item.key)}><strong>{item.title}</strong><span>{item.category} · {item.status} · {item.visibility}</span><time dateTime={item.updatedAt}>{formatTime(item.updatedAt)}</time></button></li>)}</ul></section>
      {selected ? <section className="system-support-detail" aria-label="선택한 문의"><button className="system-support-back" type="button" disabled={Boolean(actionPending)} onClick={() => setSelectedKey(null)}>목록으로 돌아가기</button><div className="system-support-meta"><span>{selected.category}</span><span>{selected.status}</span><span>{selected.visibility}</span><time dateTime={selected.createdAt}>등록 {formatTime(selected.createdAt)}</time><time dateTime={selected.updatedAt}>수정 {formatTime(selected.updatedAt)}</time></div><h2>{selected.title}</h2><p className="system-support-body">{selected.body}</p><section className="system-support-answers" aria-label="답변"><h3>답변</h3>{selected.answers.length ? <ol>{selected.answers.map((answer, index) => <li key={`${answer.createdAt}-${index}`}><p>{answer.body}</p><time dateTime={answer.createdAt}>{formatTime(answer.createdAt)}</time></li>)}</ol> : <p>등록된 답변이 없습니다.</p>}</section>{canAnswer || canHide ? <section className="system-support-actions" aria-label="문의 처리">{canAnswer ? <label>답변 내용<textarea aria-label="답변 내용" value={answerBody} onChange={(event) => setAnswerBody(event.target.value)} disabled={Boolean(actionPending)} /><button type="button" disabled={!answerBody.trim() || Boolean(actionPending)} onClick={() => runAction('answer')}>{actionPending === 'answer' ? '전송 중' : '답변 등록'}</button></label> : null}{canHide ? <button type="button" className="system-support-hide" disabled={Boolean(actionPending)} onClick={() => runAction('hide')}>{actionPending === 'hide' ? '처리 중' : '문의 숨김'}</button> : null}{actionError ? <p role="alert">{actionError.code || 'QNA_ACTION_FAILED'}</p> : null}</section> : null}</section> : null}
    </section> : null}
  </main>;
}
