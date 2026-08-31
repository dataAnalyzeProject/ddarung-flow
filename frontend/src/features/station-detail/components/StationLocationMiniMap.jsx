import { useEffect, useRef, useState } from "react";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi";

const isCoordinate = (value) => value != null && String(value).trim() !== "" && Number.isFinite(Number(value));

export default function StationLocationMiniMap({ station }) {
  const containerRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);
  const hasCoordinates = isCoordinate(station?.latitude) && isCoordinate(station?.longitude);
  const latitude = hasCoordinates ? Number(station.latitude) : Number.NaN;
  const longitude = hasCoordinates ? Number(station.longitude) : Number.NaN;

  useEffect(() => {
    let active = true;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setUnavailable(true);
      return undefined;
    }
    setUnavailable(false);
    loadKakaoMapSdk()
      .then((maps) => {
        if (!active || !containerRef.current) return;
        const point = { latitude, longitude, stationId: station.stationId, stationName: station.stationName || station.name };
        const adapter = createKakaoMapAdapter(containerRef.current, maps, point);
        adapter.setStations([point]);
      })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [latitude, longitude, station?.stationId, station?.stationName, station?.name]);

  return <section className="station-mini-map-card" aria-labelledby="station-location-title">
    <h2 id="station-location-title">대여소 위치</h2>
    {unavailable ? <div className="station-mini-map-fallback">지도 정보를 표시할 수 없습니다.</div> : <div ref={containerRef} className="station-mini-map" aria-label="대여소 위치 지도" />}
  </section>;
}
