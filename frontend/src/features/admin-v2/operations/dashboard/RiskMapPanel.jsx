import { useEffect, useRef, useState } from 'react';
import { loadKakaoMapSdk } from '../../../map/kakaoMapApi';
import { createMiniRiskKakaoMapAdapter } from './miniRiskKakaoMapAdapter';

function stateNotice(state, dataState) {
  const labels = { DELAYED: '정보 갱신 지연', PARTIAL: '일부 데이터 누락', INSUFFICIENT_DATA: '판단 정보 부족', UNAVAILABLE: '현재 사용할 수 없음' };
  return state !== 'SUCCESS' && labels[state] ? `${labels[state]} · ${dataState}` : null;
}

export default function RiskMapPanel({ items, selectedStationNumber, onSelect, referenceTime, state, dataState, loadMapSdk = loadKakaoMapSdk, createMapAdapter = createMiniRiskKakaoMapAdapter }) {
  const containerRef = useRef(null);
  const adapterRef = useRef(null);
  const previousSelectionRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [mapStatus, setMapStatus] = useState('LOADING');

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    setMapStatus('LOADING');
    loadMapSdk()
      .then((maps) => {
        if (disposed || !containerRef.current) return;
        adapterRef.current = createMapAdapter(containerRef.current, maps, { onStationSelect: (number) => onSelectRef.current(number) });
        setMapStatus('READY');
      })
      .catch(() => {
        if (!disposed) setMapStatus('ERROR');
      });
    return () => {
      disposed = true;
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, [createMapAdapter, loadMapSdk]);

  useEffect(() => {
    if (mapStatus !== 'READY' || !adapterRef.current) return;
    adapterRef.current.setStations(items, selectedStationNumber);
    const selectedItem = items.find((item) => item.station?.stationNumber === selectedStationNumber);
    if (previousSelectionRef.current && previousSelectionRef.current !== selectedStationNumber) adapterRef.current.focusStation(selectedItem);
    previousSelectionRef.current = selectedStationNumber;
  }, [items, mapStatus, selectedStationNumber]);

  return <section className="ops-dashboard-panel" aria-labelledby="risk-map-title">
    <div className="ops-panel-heading"><div><h2 id="risk-map-title">수급 위험 지도</h2><p>우선 확인 대여소 {items.length}곳</p>{stateNotice(state, dataState) ? <p className="ops-risk-state-notice" role="status">{stateNotice(state, dataState)}</p> : null}</div><div className="ops-map-actions">{referenceTime ? <small>지도 기준 {new Date(referenceTime).toLocaleString('ko-KR')}</small> : null}<a href="/admin/ops/risk-map">전체 수급 위험 지도 보기</a></div></div>
    <div ref={containerRef} className="ops-risk-map" aria-label="위험 대여소 위치" />
    {mapStatus === 'ERROR' ? <p className="ops-map-fallback" role="status"><strong>지도 사용 불가</strong><span>대여소 목록은 계속 확인할 수 있습니다.</span></p> : null}
  </section>;
}
