import { useEffect } from "react";
import "./StationMap.css";
export default function StationMap({ stations = [], viewport, onViewportChanged, onStationSelected, error, locationState = "ready" }) {
  useEffect(() => { onViewportChanged?.(viewport); }, [onViewportChanged, viewport]);
  if (locationState === "denied") return <section className="station-map" role="alert">위치 권한이 필요합니다. 출발지를 직접 입력해 주세요.</section>;
  if (error) return <section className="station-map" role="alert">대여소 정보를 불러오지 못했습니다.</section>;
  if (!stations.length) return <section className="station-map">현재 지도 범위에 대여소가 없습니다.</section>;
  return <section className="station-map" aria-label="대여소 지도"><div className="station-map-cluster" aria-label="대여소 군집">{stations.length}개 대여소</div>{stations.map((station) => <button key={station.stationId} className={`station-marker ${station.inventoryStatus.toLowerCase()}`} type="button" onClick={() => onStationSelected?.(station)}><strong>{station.stationName}</strong><span>{station.availableBikeCount === null ? "재고 확인 필요" : `${station.availableBikeCount}대`}</span><small>{station.collectedAt} 기준 · {station.inventoryStatus}</small></button>)}</section>;
}
