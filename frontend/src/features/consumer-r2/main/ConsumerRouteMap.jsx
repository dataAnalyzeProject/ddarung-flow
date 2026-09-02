import { useEffect, useMemo, useRef, useState } from "react";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi.js";

export default function ConsumerRouteMap({ candidate, destination, mapRenderer: MapRenderer, origin }) {
  const containerRef = useRef(null);
  const [mapState, setMapState] = useState("loading");
  const routeDestination = useMemo(() => (
    Number.isFinite(candidate?.latitude) && Number.isFinite(candidate?.longitude)
      ? { latitude: candidate.latitude, longitude: candidate.longitude }
      : destination
  ), [candidate?.latitude, candidate?.longitude, destination]);

  useEffect(() => {
    if (MapRenderer || !candidate?.routeDetail || !containerRef.current) return undefined;
    let active = true;
    setMapState("loading");
    loadKakaoMapSdk()
      .then((maps) => {
        if (!active || !containerRef.current) return;
        const adapter = createKakaoMapAdapter(containerRef.current, maps, origin);
        adapter.setPoints({ origin, destination: routeDestination });
        adapter.setRoutePath(candidate.routeDetail.pathPoints);
        setMapState("ready");
      })
      .catch(() => active && setMapState("unavailable"));
    return () => { active = false; };
  }, [MapRenderer, candidate, origin, routeDestination]);

  if (MapRenderer) {
    return <MapRenderer candidate={candidate} destination={routeDestination} origin={origin} routeDetail={candidate?.routeDetail} />;
  }

  return (
    <div className="cr293-map" aria-label="선택한 대여소까지의 경로 지도">
      <div className="cr293-map__canvas" ref={containerRef} />
      {mapState === "loading" ? <div className="cr293-map__message" role="status">지도를 불러오는 중입니다.</div> : null}
      {mapState === "unavailable" ? (
        <div className="cr293-map__message cr293-map__message--error" role="status">
          <strong>지도만 불러오지 못했습니다.</strong>
          <span>예측 결과와 경로 요약은 그대로 확인할 수 있습니다.</span>
        </div>
      ) : null}
    </div>
  );
}
