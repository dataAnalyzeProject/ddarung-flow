import { useEffect, useRef, useState } from "react";
import { loadKakaoMapSdk } from "../map/kakaoMapApi";
import { fetchStationLocations } from "../map/stationApi";

export function accuracyTone(segment) {
  if (!segment || segment.status === "UNKNOWN_INSUFFICIENT_SAMPLES") return "unknown";
  if (segment.status === "OK" && segment.skillScore === null) return "unknown";
  if (segment.skillScore > 0) return "good";
  if (segment.skillScore < 0) return "bad";
  return "warn";
}

const markerColor = { good: "#16845d", warn: "#b87908", bad: "#c44747", unknown: "#7b8797" };
const markerImage = (maps, tone) => new maps.MarkerImage(
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${markerColor[tone]}" stroke="white" stroke-width="3"/></svg>`)}`,
  new maps.Size(20, 20)
);

export default function AdminAccuracyMap({ segments = [] }) {
  const containerRef = useRef(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let active = true;
    const metrics = new Map(segments.filter((row) => row.axis === "STATION").map((row) => [row.segmentValue, row]));
    Promise.all([loadKakaoMapSdk(), fetchStationLocations()])
      .then(([maps, locations]) => {
        if (!active || !containerRef.current) return;
        const center = locations[0] || { latitude: 37.5665, longitude: 126.9780 };
        const map = new maps.Map(containerRef.current, { center: new maps.LatLng(center.latitude, center.longitude), level: 7 });
        locations.forEach((location) => {
          const segment = metrics.get(location.stationNumber);
          const tone = accuracyTone(segment);
          new maps.Marker({ map, position: new maps.LatLng(location.latitude, location.longitude), image: markerImage(maps, tone), title: segment?.status === "UNKNOWN_INSUFFICIENT_SAMPLES" ? `${location.name} · 표본 부족` : `${location.name} · skill score ${segment?.skillScore ?? "-"}` });
        });
        setState("success");
      })
      .catch(() => active && setState("error"));
    return () => { active = false; };
  }, [segments]);

  return <section className="admin-panel admin-accuracy-panel" aria-label="예측 정확도 지도"><header className="admin-panel-head"><h2>예측 정확도 지도</h2><span>H2 · 3대 기준</span></header><div className="admin-accuracy-map" ref={containerRef} aria-label="Kakao 정확도 지도" />{state === "loading" && <p className="admin-accuracy-message">지도를 불러오는 중입니다.</p>}{state === "error" && <p className="admin-accuracy-message">정확도 지도를 불러오지 못했습니다.</p>}<div className="admin-accuracy-legend" aria-label="skill score 범례"><span className="admin-accuracy-good">양수</span><span className="admin-accuracy-warn">0</span><span className="admin-accuracy-bad">음수</span><span className="admin-accuracy-unknown">표본 부족</span></div></section>;
}
