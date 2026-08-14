import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createKakaoMapAdapter, estimateRoute, loadKakaoMapSdk } from "./kakaoMapApi";
import currentLocationMarker from "./assets/current-location-marker.png";
import bikeStationMarker from "./assets/bike-station-marker.png";
import { fetchStationDetail, fetchStationLocations } from "./stationApi";
import "./MapRoutePanel.css";

const MODE_MAP = { "도보": "WALK", "대중교통": "PUBLIC_TRANSIT", WALK: "WALK", PUBLIC_TRANSIT: "PUBLIC_TRANSIT" };

function locationErrorMessage(error) {
  if (error?.code === 1) return "현재 위치 권한이 거부되었습니다.";
  if (error?.code === 3) return "현재 위치 확인 시간이 초과되었습니다.";
  return "현재 위치를 확인할 수 없습니다.";
}

function formatArrival(durationSeconds, now = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(now.getTime() + durationSeconds * 1000));
}

export default function MapRoutePanel({
  travelMode,
  selectedPlaces,
  onDurationChange,
  fallbackImage,
}) {
  const containerRef = useRef(null);
  const adapterRef = useRef(null);
  const [sdkStatus, setSdkStatus] = useState(
    process.env.REACT_APP_KAKAO_MAP_APP_KEY ? "loading" : "missing-key"
  );
  const [mapType, setMapType] = useState("지도");
  const [mapLevel, setMapLevel] = useState(5);
  const [current, setCurrent] = useState(null);
  const [locationState, setLocationState] = useState("idle");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState(null);
  const [routeState, setRouteState] = useState("idle");
  const [showStations, setShowStations] = useState(false);
  const [stationLocations, setStationLocations] = useState(null);
  const [stationLoadState, setStationLoadState] = useState("idle");
  const stationRequestRef = useRef(0);

  const mode = MODE_MAP[travelMode] || "WALK";
  const fallbackScale = Number((1 + (5 - mapLevel) * 0.1).toFixed(2));
  const selected = selectedPlaces || { origin: null, destination: null };
  const points = useMemo(() => ({ current, origin: selected.origin, destination: selected.destination }), [current, selected.origin, selected.destination]);

  const handleStationSelected = useCallback(async (location) => {
    const requestId = stationRequestRef.current + 1;
    stationRequestRef.current = requestId;
    adapterRef.current?.showStationOverlay({ ...location, inventoryStatus: "LOADING" });
    try {
      const detail = await fetchStationDetail(location.stationId);
      if (stationRequestRef.current === requestId) adapterRef.current?.showStationOverlay(detail);
    } catch (error) {
      if (stationRequestRef.current === requestId) {
        adapterRef.current?.showStationOverlay({
          ...location,
          inventoryStatus: "UNAVAILABLE",
          availableBikeCount: null,
          popupMessage: error.message === "STATION_NOT_FOUND" ? "대여소 정보를 찾을 수 없습니다" : "재고 조회 불가",
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!process.env.REACT_APP_KAKAO_MAP_APP_KEY) return undefined;
    let active = true;
    loadKakaoMapSdk()
      .then((maps) => {
        if (!active || !containerRef.current) return;
        adapterRef.current = createKakaoMapAdapter(containerRef.current, maps, undefined, {
          currentMarkerImage: currentLocationMarker,
          stationMarkerImage: bikeStationMarker,
        });
        setSdkStatus("ready");
      })
      .catch((error) => active && setSdkStatus(error.message === "KAKAO_MAP_KEY_MISSING" ? "missing-key" : "failed"));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    adapterRef.current?.setPoints(points);
    if (current) adapterRef.current?.setCenter(current);
  }, [points, current, sdkStatus]);
  useEffect(() => {
    if (!adapterRef.current) return;
    adapterRef.current.setStations(showStations && stationLocations ? stationLocations : [], handleStationSelected);
  }, [handleStationSelected, showStations, stationLocations, sdkStatus]);
  useEffect(() => { adapterRef.current?.setLevel(mapLevel); }, [mapLevel]);
  useEffect(() => { adapterRef.current?.setMapType(mapType === "위성"); }, [mapType]);

  // Route estimation is intentionally triggered when both selected places or the travel mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const locate = () => {
    if (!navigator.geolocation) {
      setLocationState("error");
      setMessage("이 브라우저는 현재 위치를 지원하지 않습니다.");
      return;
    }
    setLocationState("loading");
    setMessage("현재 위치를 확인하고 있습니다.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        setCurrent(point);
        adapterRef.current?.setCenter(point);
        setLocationState("success");
        setMessage("현재 위치를 지도에 표시했습니다.");
      },
      (error) => {
        setLocationState("error");
        setMessage(locationErrorMessage(error));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const requestRoute = async () => {
    if (!selected.origin || !selected.destination) return setMessage("출발지와 목적지를 검색 결과에서 선택해 주세요.");
    setRouteState("loading");
    setMessage("");
    try {
      const result = await estimateRoute({
        originLatitude: selected.origin.latitude,
        originLongitude: selected.origin.longitude,
        destinationLatitude: selected.destination.latitude,
        destinationLongitude: selected.destination.longitude,
        travelMode: mode,
      });
      setRoute({ ...result, arrivalAt: formatArrival(result.durationSeconds) });
      onDurationChange?.(Math.max(1, Math.ceil(result.durationSeconds / 60)));
      setRouteState("success");
    } catch (error) {
      setRoute(null);
      setRouteState("error");
      setMessage(error.message === "INVALID_ROUTE_REQUEST" ? "경로 요청 조건을 확인해 주세요." : "경로 제공자를 사용할 수 없습니다.");
    }
  };

  const toggleStations = async () => {
    if (showStations) {
      stationRequestRef.current += 1;
      setShowStations(false);
      return;
    }
    setShowStations(true);
    if (stationLocations) return;
    setStationLoadState("loading");
    try {
      const locations = await fetchStationLocations();
      setStationLocations(locations);
      setStationLoadState("success");
    } catch {
      setShowStations(false);
      setStationLoadState("error");
      setMessage("대여소 위치를 불러오지 못했습니다.");
    }
  };

  // Route estimation intentionally follows the selected places and travel mode.
  useEffect(() => {
    if (selected.origin && selected.destination) requestRoute();
  }, [selected.origin, selected.destination, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="main-map-panel map-route-panel" aria-label="예측 지도">
      <header className="main-section-head"><h2>경로 지도</h2><span>장소 선택 후 거리와 도착시각을 확인하세요.</span></header>
      <div className="main-map map-route-panel__map">
        <div className="map-route-panel__canvas" ref={containerRef} aria-label="Kakao 지도" />
        {sdkStatus !== "ready" && <img className={mapType === "위성" ? "satellite" : ""} style={{ transform: `scale(${fallbackScale})` }} src={fallbackImage} alt="천호동 이동 경로와 추천 대여소 지도" />}
        {sdkStatus === "missing-key" && <p className="map-route-panel__message" style={{ top: 63, bottom: "auto", left: 14 }}>지도 SDK 키가 없어 예시 지도를 표시합니다.</p>}
        {sdkStatus === "failed" && <p className="map-route-panel__message" style={{ top: 63, bottom: "auto", left: 14 }}>지도 SDK를 불러오지 못해 예시 지도를 표시합니다.</p>}
        <div className="main-map-tabs">{["지도", "위성"].map((type) => <button className={mapType === type ? "active" : ""} type="button" aria-pressed={mapType === type} key={type} onClick={() => setMapType(type)}>{type}</button>)}</div>
        <button className="map-route-panel__stations-toggle" type="button" aria-pressed={showStations} disabled={stationLoadState === "loading"} onClick={toggleStations}>
          {stationLoadState === "loading" ? "대여소 불러오는 중" : showStations ? "대여소 숨기기" : "대여소 표시"}
        </button>
        <button className="main-redraw" type="button" aria-label="내 위치 확인" disabled={locationState === "loading"} onClick={locate}>
          <span aria-hidden="true">{locationState === "loading" ? "⌛" : "📍"}</span>
          {locationState === "loading" ? "확인 중" : "내 위치"}
        </button>
        <div className="main-zoom"><button type="button" aria-label="지도 확대" onClick={() => setMapLevel((level) => Math.max(1, level - 1))}>＋</button><button type="button" aria-label="지도 축소" onClick={() => setMapLevel((level) => Math.min(14, level + 1))}>−</button></div>
        <button className="map-route-panel__estimate" type="button" disabled={routeState === "loading"} onClick={requestRoute}>{routeState === "loading" ? "경로 확인 중" : "경로 확인"}</button>
        {message && <p className="map-route-panel__message" role="status">{message}</p>}
        {route && <dl className="map-route-panel__summary"><div><dt>거리</dt><dd>{route.distanceMeters.toLocaleString()}m</dd></div><div><dt>예상 이동시간</dt><dd>{Math.ceil(route.durationSeconds / 60)}분</dd></div><div><dt>도착시각</dt><dd>{route.arrivalAt}</dd></div></dl>}
      </div>
    </section>
  );
}

export { formatArrival, locationErrorMessage };
