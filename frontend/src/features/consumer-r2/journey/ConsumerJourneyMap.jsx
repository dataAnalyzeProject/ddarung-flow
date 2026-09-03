import { useEffect, useMemo, useRef, useState } from "react";
import { loadKakaoMapSdk } from "../../map/kakaoMapApi.js";
import { AsyncState, ConsumerIcon, MapShell } from "../shared";

const SEGMENT_COLORS = { ACCESS: "#0969e8", RENT: "#008a76", RIDE: "#008a76", VISIT: "#7137d6" };

function validPoint(point) {
  return Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

export default function ConsumerJourneyMap({ segments = [] }) {
  const canvasRef = useRef(null);
  const [state, setState] = useState("loading");
  const routes = useMemo(() => segments.filter((segment) => (
    Array.isArray(segment.pathPoints) && segment.pathPoints.length >= 2 && segment.pathPoints.every(validPoint)
  )), [segments]);
  const missingRoute = segments.some((segment) => ["ACCESS", "RIDE"].includes(segment.type) && !routes.includes(segment));

  useEffect(() => {
    if (!routes.length) return undefined;
    let active = true;
    let resizeObserver;
    const container = canvasRef.current;
    const lines = [];
    const markers = [];
    setState("loading");
    loadKakaoMapSdk().then((maps) => {
      if (!active) return;
      const point = (value) => new maps.LatLng(value.latitude, value.longitude);
      const map = new maps.Map(container, { center: point(routes[0].pathPoints[0]), level: 5 });
      const bounds = new maps.LatLngBounds();
      const marked = new Set();
      routes.forEach((segment) => {
        const path = segment.pathPoints.map(point);
        lines.push(new maps.Polyline({ map, path, strokeColor: SEGMENT_COLORS[segment.type] || "#008a76", strokeWeight: 5, strokeOpacity: 0.9, strokeStyle: "solid" }));
        path.forEach((position) => bounds.extend(position));
        [0, segment.pathPoints.length - 1].forEach((index) => {
          const endpoint = segment.pathPoints[index];
          const key = `${endpoint.latitude},${endpoint.longitude}`;
          if (marked.has(key)) return;
          marked.add(key);
          markers.push(new maps.Marker({ map, position: point(endpoint), title: `${segment.type} ${index === 0 ? "출발" : "도착"}` }));
        });
      });
      map.setBounds(bounds);
      resizeObserver = new ResizeObserver(() => {
        if (!active) return;
        map.relayout();
        map.setBounds(bounds);
      });
      resizeObserver.observe(container);
      setState("ready");
    }).catch(() => {
      if (!active) return;
      lines.forEach((line) => line.setMap(null));
      markers.forEach((marker) => marker.setMap(null));
      container.replaceChildren();
      setState("error");
    });
    return () => {
      active = false;
      resizeObserver?.disconnect();
      lines.forEach((line) => line.setMap(null));
      markers.forEach((marker) => marker.setMap(null));
      container.replaceChildren();
    };
  }, [routes]);

  return <MapShell ariaLabel="실제 여정 경로 지도" legend={routes.length && state === "ready" ? <div className="cr22-journey__map-legend">{Object.keys(SEGMENT_COLORS).map((type) => <span key={type}><i className={`is-${type.toLowerCase()}`} />{type}</span>)}</div> : null} footer={<p className="cr22-journey__map-note"><ConsumerIcon name="info" size={16} /> 실제 구간별 경로만 표시합니다.{missingRoute ? " 경로를 확인하지 못한 구간은 연결하지 않았습니다." : ""}</p>}>
    {routes.length ? <>
      <div className="cr22-journey__route-plot" ref={canvasRef} style={state === "error" ? { display: "none" } : undefined} aria-hidden="true" />
      {state === "loading" ? <p role="status">여정 지도를 불러오는 중입니다.</p> : null}
      {state === "error" ? <AsyncState state="error" title="지도만 불러오지 못했습니다" description="일정과 확인된 근거는 계속 확인할 수 있습니다." /> : null}
    </> : <AsyncState state="empty" title="확인된 경로 좌표가 없습니다" description="실제 경로가 없는 구간은 추정해서 표시하지 않습니다." />}
  </MapShell>;
}
