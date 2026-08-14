import { useEffect } from "react";
import bikeStationMarker from "./assets/bike-station-marker.png";
import currentLocationMarker from "./assets/current-location-marker.png";
import mapBackground from "./assets/station-map-background.png";
import "./StationMap.css";

const markerPositions = [
  { left: "28%", top: "28%" },
  { left: "63%", top: "46%" },
  { left: "42%", top: "67%" },
];

export default function StationMap({
  stations = [],
  viewport,
  onViewportChanged,
  onStationSelected,
  error,
  locationState = "ready",
}) {
  useEffect(() => {
    onViewportChanged?.(viewport);
  }, [onViewportChanged, viewport]);

  if (locationState === "denied") {
    return <section className="station-map station-map-message" role="alert">위치 권한이 필요합니다. 출발지를 직접 입력해 주세요.</section>;
  }

  if (error) {
    return <section className="station-map station-map-message" role="alert">대여소 정보를 불러오지 못했습니다.</section>;
  }

  if (!stations.length) {
    return <section className="station-map station-map-message">현재 지도 범위에 대여소가 없습니다.</section>;
  }

  return (
    <section className="station-map" aria-label="대여소 지도" style={{ backgroundImage: `url(${mapBackground})` }}>
      <div className="station-map-cluster" aria-label="대여소 군집">{stations.length}개 대여소</div>
      <img className="station-map-current-location" src={currentLocationMarker} alt="현재 위치" />
      {stations.map((station, index) => {
        const markerPosition = markerPositions[index % markerPositions.length];
        const bikeLabel = station.availableBikeCount === null ? "재고 확인 필요" : `${station.availableBikeCount}대`;

        return (
          <button
            key={station.stationId}
            className={`station-marker ${station.inventoryStatus.toLowerCase()}`}
            style={markerPosition}
            type="button"
            onClick={() => onStationSelected?.(station)}
          >
            <img src={bikeStationMarker} alt="" />
            <span className="station-marker-card">
              <strong>{station.stationName}</strong>
              <span>{bikeLabel}</span>
              <small>{station.collectedAt} 기준 · {station.inventoryStatus}</small>
            </span>
          </button>
        );
      })}
    </section>
  );
}
