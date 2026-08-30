import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStatePanel from '../../components/AsyncStatePanel';
import { loadKakaoMapSdk } from '../../../map/kakaoMapApi';
import { createFixtureRiskMapAdapter } from './riskMapFixtures';
import { createRiskKakaoMapAdapter } from './riskKakaoMapAdapter';
import { parseRiskMapQuery, riskMapFixtureName, updateRiskMapQuery } from './riskMapQuery';
import RiskLegend from './RiskLegend';
import RiskStationList from './RiskStationList';
import RiskStationDrawer from './RiskStationDrawer';

const STATE = { NORMAL: 'SUCCESS', DELAYED: 'DELAYED', MISSING: 'PARTIAL', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA', UNAVAILABLE: 'UNAVAILABLE' };
const formatTime = (value) => value || '기준시각 없음';

export default function RiskMapPage({ createDataAdapter, loadMapSdk = loadKakaoMapSdk, createMapAdapter = createRiskKakaoMapAdapter }) {
  const fixture = riskMapFixtureName();
  const adapter = useMemo(() => fixture ? createFixtureRiskMapAdapter({ fixtureName: fixture }) : createDataAdapter(), [createDataAdapter, fixture]);
  const [filters, setFilters] = useState(() => parseRiskMapQuery());
  const [bbox, setBbox] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStationNumber, setSelectedStationNumber] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [mapAdapter, setMapAdapter] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const mapNode = useRef(null);
  const listController = useRef(null);
  const detailController = useRef(null);
  const generation = useRef(0);

  const setManagedFilters = useCallback((next) => {
    const normalized = { ...filters, ...next };
    window.history.replaceState({}, '', `${window.location.pathname}${updateRiskMapQuery(normalized)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setFilters(normalized);
  }, [filters]);

  useEffect(() => {
    const onPop = () => setFilters(parseRiskMapQuery());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const load = useCallback((cursor = null, append = false) => {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    const current = ++generation.current;
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(null); setResult(null); }
    adapter.loadList({ ...filters, bbox, limit: 100, cursor, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted || generation.current !== current) return;
        setResult((previous) => append ? { ...next, items: [...(previous?.items || []), ...(next.items || [])] } : next);
      })
      .catch((nextError) => { if (!controller.signal.aborted && generation.current === current) setError(nextError); })
      .finally(() => { if (!controller.signal.aborted && generation.current === current) { setLoading(false); setLoadingMore(false); } });
  }, [adapter, bbox, filters]);

  useEffect(() => {
    setSelectedStationNumber(null);
    detailController.current?.abort();
    setDetail(null);
    setDetailError(null);
    load();
    return () => listController.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!mapNode.current) return undefined;
    let active = true;
    let instance;
    loadMapSdk().then((maps) => {
      if (!active) return;
      instance = createMapAdapter(mapNode.current, maps, {
        onStationSelect: setSelectedStationNumber,
        onViewportChange: (next) => {
          window.clearTimeout(mapNode.current?.bboxTimer);
          mapNode.current.bboxTimer = window.setTimeout(() => setBbox(next), 250);
        },
      });
      setMapAdapter(instance);
    }).catch((nextError) => { if (active) setMapError(nextError); });
    return () => { active = false; instance?.destroy(); };
  }, [createMapAdapter, loadMapSdk, loading]);

  const items = useMemo(() => result?.items || [], [result]);
  useEffect(() => { mapAdapter?.setStations(items, selectedStationNumber); }, [items, mapAdapter, selectedStationNumber]);
  useEffect(() => {
    if (!selectedStationNumber) return undefined;
    const controller = new AbortController();
    detailController.current?.abort();
    detailController.current = controller;
    setDetailLoading(true); setDetail(null); setDetailError(null);
    adapter.loadDetail(selectedStationNumber, { ...filters, signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setDetail(next); })
      .catch((next) => { if (!controller.signal.aborted) setDetailError(next); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [adapter, filters, selectedStationNumber]);

  const select = (number) => {
    setSelectedStationNumber(number);
    mapAdapter?.focusStation(items.find((item) => item.station.stationNumber === number));
  };
  const uiState = error ? (error.status === 401 || error.status === 403 ? 'FORBIDDEN' : 'ERROR') : STATE[result?.dataState] || 'SUCCESS';

  return <main className="risk-map-page" aria-label="수급 위험 지도">
    <header><div><p className="risk-eyebrow">UI-OPS-02</p><h1>수급 위험 지도</h1></div><div className="risk-controls">
      <label>예측 horizon<select value={filters.horizonMinutes} onChange={(event) => setManagedFilters({ horizonMinutes: Number(event.target.value) })}>{[60, 120, 180, 240].map((value) => <option key={value} value={value}>{value}분</option>)}</select></label>
      <label>필요 자전거 수<select value={filters.requiredBikeCount} onChange={(event) => setManagedFilters({ requiredBikeCount: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}대</option>)}</select></label>
      <label>데이터 상태<select value={filters.dataState || ''} onChange={(event) => setManagedFilters({ dataState: event.target.value || null })}><option value="">전체</option>{['NORMAL', 'DELAYED', 'MISSING', 'INSUFFICIENT_DATA', 'UNAVAILABLE'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div></header>
    <section className="risk-context" aria-label="목록 기준"><span><b>목록 기준시각</b>{formatTime(result?.referenceTime)}</span><span><b>예측 horizon</b>{filters.horizonMinutes}분</span><span><b>필요 자전거 수</b>{filters.requiredBikeCount}대</span><span><b>데이터 상태</b>{result?.dataState || '불러오는 중'}</span><span><b>현재 표시</b>{items.length}곳</span></section>
    {loading ? <AsyncStatePanel state="LOADING" /> : null}
    {!loading && error ? <AsyncStatePanel state={uiState} code={error.code} requiredPermission={uiState === 'FORBIDDEN' ? 'OPS_RISK_MAP_READ' : undefined} /> : null}
    {!loading && !error ? <>
      <p className="risk-source-notice">대여 부족 위험 기반 화면입니다. 반납 위험은 현재 지원되지 않습니다.</p>
      {uiState !== 'SUCCESS' ? <AsyncStatePanel state={uiState} /> : null}
      {result?.limitations?.length ? <p className="risk-limitations">제한 사항: {result.limitations.join(', ')}</p> : null}
      <section className="risk-map-layout">
        <section className="risk-map-panel" aria-labelledby="risk-map-heading"><h2 id="risk-map-heading">위험 지도</h2>{mapError ? <p role="status">지도 사용 불가: {mapError.message} · 목록은 계속 사용할 수 있습니다.</p> : <div ref={mapNode} className="risk-kakao-map" aria-label="위험 대여소 지도" />}<RiskLegend /></section>
        <RiskStationList items={items} selectedStationNumber={selectedStationNumber} onSelect={select} onLoadMore={result?.nextCursor ? () => load(result.nextCursor, true) : null} loadingMore={loadingMore} />
      </section>
      {uiState === 'SUCCESS' && !items.length ? <p className="risk-empty">현재 필터/지도 범위에 해당하는 대여소가 없습니다.</p> : null}
    </> : null}
    {selectedStationNumber ? <RiskStationDrawer stationNumber={selectedStationNumber} detail={detail} error={detailError} loading={detailLoading} onClose={() => { detailController.current?.abort(); setSelectedStationNumber(null); }} /> : null}
  </main>;
}
