import { useCallback, useEffect, useState } from 'react';

const STATUS_LABELS = { PENDING: '요청됨', GENERATING: '생성 중', COMPLETED: '완료', FAILED: '실패', EXPIRED: '만료' };
const SOURCE_LABELS = { CURATED: '현재 서비스 재고', QUARANTINE_NORMALIZED: '격리 데이터' };
const can = (permissions, permission) => Array.isArray(permissions) && permissions.includes(permission);
const formatTime = (value) => value ? new Date(value).toLocaleString('ko-KR') : '—';
const formatCount = (value) => typeof value === 'number' ? value.toLocaleString('ko-KR') : '—';

export default function DataExportPanel({ adapter, permissions }) {
  const [items, setItems] = useState([]); const [state, setState] = useState('LOADING'); const [error, setError] = useState(null);
  const [format, setFormat] = useState('CSV'); const [rowCount, setRowCount] = useState('1000'); const [purpose, setPurpose] = useState('운영 데이터 확인');
  const canRequest = can(permissions, 'DATA_EXPORT_REQUEST'); const canDownload = can(permissions, 'DATA_EXPORT_DOWNLOAD');
  const load = useCallback(async () => {
    setState('LOADING'); setError(null);
    try { const result = await adapter.listExports(); setItems(result.items || []); setState('READY'); }
    catch (next) { setError(next); setState('ERROR'); }
  }, [adapter]);
  useEffect(() => { if (canRequest || canDownload) load(); else setState('HIDDEN'); }, [canDownload, canRequest, load]);

  if (state === 'HIDDEN') return null;
  const submit = async (event) => {
    event.preventDefault(); setError(null);
    try { await adapter.createExport({ source: 'CURATED', format, purpose, rowCount: Number(rowCount) }); await load(); }
    catch (next) { await load(); setError(next); }
  };
  const download = async (item) => {
    try {
      const file = await adapter.downloadExport(item.exportId);
      const url = URL.createObjectURL(file.blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `export-${item.exportId}.${item.format === 'CSV' ? 'csv' : 'parquet'}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (next) { setError(next); }
  };
  return <section className="data-export-panel" aria-labelledby="data-export-heading">
    <div className="operations-data-section-heading"><div><h2 id="data-export-heading">데이터 내보내기</h2><p>현재 서비스 재고를 원본 그대로 담은 CSV 또는 Parquet 파일을 생성합니다.</p></div></div>
    <p className="operations-data-safety-notice">격리 데이터는 보존된 원본이 없어 내보내기를 지원하지 않습니다. 빈 파일을 0건으로 만들지 않습니다.</p>
    {canRequest && <form className="data-export-form" onSubmit={submit}>
      <label>형식<select value={format} onChange={(event) => setFormat(event.target.value)}><option>CSV</option><option>PARQUET</option></select></label>
      <label>최대 요청 행 수<input type="number" min="0" max={format === 'CSV' ? 100000 : 1000000} value={rowCount} onChange={(event) => setRowCount(event.target.value)} required /></label>
      <label>목적<input maxLength="256" value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
      <button type="submit">내보내기 요청</button>
    </form>}
    {error && <p className="data-export-error" role="alert">{error.code === 'EXPORT_SOURCE_UNAVAILABLE' ? '선택한 원본은 현재 내보낼 수 없습니다.' : '내보내기 요청을 처리하지 못했습니다.'}</p>}
    {state === 'LOADING' ? <p>내보내기 목록을 불러오는 중입니다.</p> : <table><caption>내보내기 요청과 실제 출력 결과</caption><thead><tr><th>요청 시각</th><th>원본</th><th>형식</th><th>상태</th><th>요청/출력 행</th><th>만료</th><th>파일</th></tr></thead><tbody>
      {items.length ? items.map((item) => <tr key={item.exportId}><td>{formatTime(item.requestedAt)}</td><td>{SOURCE_LABELS[item.source] || item.source}</td><td>{item.format}</td><td>{STATUS_LABELS[item.status] || item.status}{item.failureReasonCode ? ` · ${item.failureReasonCode}` : ''}</td><td>{formatCount(item.requestedRowCount)} / {formatCount(item.outputRowCount ?? item.rowCount)}</td><td>{formatTime(item.expiresAt)}</td><td>{canDownload && item.status === 'COMPLETED' ? <button type="button" onClick={() => download(item)}>다운로드</button> : '—'}</td></tr>) : <tr><td colSpan="7">내보내기 요청이 없습니다.</td></tr>}
    </tbody></table>}
  </section>;
}
