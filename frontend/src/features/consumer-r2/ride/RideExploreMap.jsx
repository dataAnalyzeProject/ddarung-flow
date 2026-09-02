import { useEffect, useRef, useState } from "react";
import { createRideMapAdapter } from "../adapters/ride";

export default function RideExploreMap({ createMap = createRideMapAdapter, onSelectPoi, pois, route, selectedPoi, station }) {
  const canvasRef = useRef(null);
  const dataRef = useRef({ pois, route, selectedPoi, station });
  const mapRef = useRef(null);
  const [state, setState] = useState("loading");
  dataRef.current = { pois, route, selectedPoi, station };

  useEffect(() => {
    let active = true;
    let instance;
    setState("loading");
    createMap(canvasRef.current, { onSelectPoi })
      .then((value) => {
        if (!active) {
          value.destroy?.();
          return;
        }
        instance = value;
        mapRef.current = value;
        value.setData(dataRef.current);
        setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
      instance?.destroy?.();
      if (mapRef.current === instance) mapRef.current = null;
    };
  }, [createMap, onSelectPoi]);

  useEffect(() => {
    mapRef.current?.setData({ pois, route, selectedPoi, station });
  }, [pois, route, selectedPoi, station]);

  return (
    <section className="cr22-ride__map" aria-label="대여소와 주변 장소 지도" aria-busy={state === "loading" || undefined}>
      <div className="cr22-ride__map-canvas" ref={canvasRef} aria-hidden={state !== "ready"} />
      {state === "loading" ? <p className="cr22-ride__map-state" role="status">지도를 불러오는 중…</p> : null}
      {state === "error" ? <p className="cr22-ride__map-state" role="alert">지도를 불러오지 못했습니다. 장소 목록에서 계속 선택할 수 있습니다.</p> : null}
    </section>
  );
}
