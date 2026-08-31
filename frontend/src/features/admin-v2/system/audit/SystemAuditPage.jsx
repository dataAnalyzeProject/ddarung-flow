import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';

const EMPTY_FILTERS = { action: '', result: '', reasonCode: '', from: '', to: '' };

function isAccessError(error) { return error?.status === 401 || error?.status === 403; }
function formatDate(value) { return new Date(value).toLocaleString('ko-KR'); }
function toApiTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export default function SystemAuditPage({ createAdapter }) {
  const adapter = useMemo(() => createAdapter(), [createAdapter]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true); setError(null); setData(null);
    adapter.load({ ...appliedFilters, from: toApiTime(appliedFilters.from), to: toApiTime(appliedFilters.to), page, size: 20, signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted && generation.current === current) setData(next); })
      .catch((nextError) => {
        if (!controller.signal.aborted && nextError?.name !== 'AbortError' && generation.current === current) setError(nextError);
      })
      .finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => controller.abort();
  }, [adapter, appliedFilters, page, retryVersion]);

  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) return;
    setPage(0); setAppliedFilters({ ...filters });
  };
  const reset = () => { setFilters(EMPTY_FILTERS); setAppliedFilters({ ...EMPTY_FILTERS }); setPage(0); };
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const totalPages = data?.size > 0 ? (data.total === 0 ? 0 : Math.ceil(data.total / data.size)) : null;
  const hasNext = Boolean(data?.size > 0 && (page + 1) * data.size < data.total);

  return <main className="system-audit-page" aria-label="관리자 변경 이력">
    <header className="system-audit-header"><div><p className="system-audit-eyebrow">SYS-03</p><h1>관리자 변경 이력</h1><p>관리자 작업을 읽기 전용으로 확인합니다.</p></div></header>
    <form className="system-audit-filters" onSubmit={submit} aria-label="감사 이력 필터">
      <label>작업<input value={filters.action} onChange={(event) => updateFilter('action', event.target.value)} /></label>
      <label>결과<select value={filters.result} onChange={(event) => updateFilter('result', event.target.value)}><option value="">전체</option><option value="SUCCESS">SUCCESS</option><option value="FAILURE">FAILURE</option></select></label>
      <label>사유 코드<input value={filters.reasonCode} onChange={(event) => updateFilter('reasonCode', event.target.value)} /></label>
      <label>시작 시각<input type="datetime-local" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
      <label>종료 시각<input type="datetime-local" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
      <div className="system-audit-filter-actions"><button type="submit" disabled={invalidRange}>조회</button><button type="button" onClick={reset}>초기화</button></div>
      {invalidRange ? <p role="alert" className="system-audit-validation">시작 시각은 종료 시각보다 늦을 수 없습니다.</p> : null}
    </form>
    <section className="system-audit-content" aria-label="감사 이력 결과">
      {loading ? <AsyncStatePanel state="LOADING" /> : null}
      {error ? <><AsyncStatePanel state={isAccessError(error) ? 'FORBIDDEN' : 'ERROR'} code={error.code} requiredPermission={isAccessError(error) ? 'AUDIT_READ' : undefined} />{!isAccessError(error) ? <button type="button" onClick={() => setRetryVersion((version) => version + 1)}>다시 시도</button> : null}</> : null}
      {!loading && !error && data?.items.length === 0 ? <AsyncStatePanel state="EMPTY" /> : null}
      {!loading && !error && data?.items.length ? <>
        <div className="system-audit-table-wrap"><table><caption>관리자 변경 이력</caption><thead><tr><th scope="col">발생 시각</th><th scope="col">작업</th><th scope="col">대상 유형</th><th scope="col">수행 역할</th><th scope="col">결과</th><th scope="col">사유 코드</th></tr></thead><tbody>{data.items.map((item, index) => <tr key={`${item.occurredAt}-${item.action}-${index}`}><td>{formatDate(item.occurredAt)}</td><td>{item.action}</td><td>{item.targetType}</td><td>{item.actorRoleCodes.join(', ')}</td><td><span className={`system-audit-result system-audit-result--${item.result.toLowerCase()}`} aria-label={`결과: ${item.result}`}>{item.result}</span></td><td>{item.reasonCode || '-'}</td></tr>)}</tbody></table></div>
        <nav className="system-audit-pagination" aria-label="감사 이력 페이지"><button type="button" disabled={page <= 0} onClick={() => setPage((current) => current - 1)}>이전</button><span>{totalPages === null ? `현재 ${page + 1} 페이지` : `현재 ${totalPages === 0 ? 0 : page + 1} / ${totalPages} 페이지`}</span><button type="button" disabled={!hasNext} onClick={() => setPage((current) => current + 1)}>다음</button></nav>
      </> : null}
    </section>
  </main>;
}
