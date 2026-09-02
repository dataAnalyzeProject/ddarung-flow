import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AsyncState,
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
  StatusBadge,
} from "../shared";
import { consumerRideAdapter, RIDE_ROUTE_MODES, RIDE_THEMES } from "../adapters/ride";
import RideExploreMap from "./RideExploreMap";
import "./rideExplore.css";

const THEME_COPY = {
  PARK: "공원",
  RIVER: "한강",
  CAFE: "카페",
  ATTRACTION: "볼거리",
  CULTURE: "문화",
  FOOD: "음식",
};

const ROUTE_MODE_COPY = {
  BIKE_ONLY: "자전거 우선",
  ACCESSIBLE: "접근성 우선",
  SHORTEST: "최단 거리",
};

function formatDistance(value) {
  if (!Number.isFinite(Number(value))) return "거리 확인 불가";
  return Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}km` : `${Math.round(Number(value))}m`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "시간 확인 불가";
  return `약 ${Math.round(Number(seconds) / 60)}분`;
}

function formatCollectedAt(value) {
  if (!value) return "수집 시각 미제공";
  const collectedAt = new Date(value);
  if (Number.isNaN(collectedAt.getTime())) return "수집 시각 확인 불가";
  return `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(collectedAt)} 기준`;
}

function stationInventory(station) {
  const collectedAt = formatCollectedAt(station?.collectedAt);
  const count = station?.availableBikeCount !== null && station?.availableBikeCount !== undefined && Number.isFinite(Number(station.availableBikeCount))
    ? Number(station.availableBikeCount)
    : null;
  if (station?.inventoryStatus === "NORMAL") return `${count === null ? "현재 재고 확인 필요" : `현재 자전거 ${count}대`} · 정상 · ${collectedAt}`;
  if (station?.inventoryStatus === "DELAYED") return `${count === null ? "지연 재고 수량 확인 필요" : `지연 재고 ${count}대`} · ${collectedAt}`;
  if (station?.inventoryStatus === "MISSING") return `재고 수집 누락 · ${collectedAt}`;
  if (station?.inventoryStatus === "UNAVAILABLE") return `재고 조회 불가 · ${collectedAt}`;
  return `재고 상태 미제공 · ${collectedAt}`;
}

function PoiCard({ onSelect, poi, selected, theme }) {
  return (
    <li>
      <article className={`cr22-ride__poi${selected ? " is-selected" : ""}`}>
        <div className="cr22-ride__poi-icon" aria-hidden="true"><ConsumerIcon name="mapPin" size={22} /></div>
        <div className="cr22-ride__poi-copy">
          <div><h2>{poi.name}</h2><StatusBadge tone="success">{THEME_COPY[theme]}</StatusBadge></div>
          <p>{poi.address || poi.category || "주소 정보 없음"}</p>
          <span><ConsumerIcon name="mapPin" size={14} /> {formatDistance(poi.distanceMeters)}</span>
        </div>
        <ConsumerButton size="sm" variant={selected ? "primary" : "secondary"} aria-pressed={selected} aria-label={`${poi.name} 선택`} onClick={() => onSelect(poi)}>
          {selected ? <ConsumerIcon name="check" size={16} /> : null}{selected ? "선택됨" : "선택"}
        </ConsumerButton>
      </article>
    </li>
  );
}

function RouteSummary({ route, routeMode }) {
  return (
    <section className="cr22-ride__route-summary" aria-label="선택한 자전거 경로 정보">
      <dl>
        <div><dt>거리</dt><dd>{formatDistance(route.distanceMeters)}</dd></div>
        <div><dt>자전거 시간</dt><dd>{formatDuration(route.durationSeconds)}</dd></div>
        <div><dt>이동 수단</dt><dd>{route.travelMode === "BICYCLE" ? "자전거" : "확인 불가"}</dd></div>
        <div><dt>경로 방식</dt><dd>{ROUTE_MODE_COPY[routeMode]}</dd></div>
      </dl>
    </section>
  );
}

export default function RideExplorePage({
  adapter = consumerRideAdapter,
  authState = "anonymous",
  MapComponent = RideExploreMap,
  onNavigate,
  stationId,
  user,
}) {
  const [station, setStation] = useState(null);
  const [stationState, setStationState] = useState("loading");
  const [stationRetry, setStationRetry] = useState(0);
  const [theme, setTheme] = useState("PARK");
  const [pois, setPois] = useState([]);
  const [poiState, setPoiState] = useState("loading");
  const [poiRetry, setPoiRetry] = useState(0);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [routeMode, setRouteMode] = useState("BIKE_ONLY");
  const [route, setRoute] = useState(null);
  const [routeState, setRouteState] = useState("idle");
  const [routeRetry, setRouteRetry] = useState(0);
  const stationRequestId = useRef(0);
  const poiRequestId = useRef(0);
  const routeRequestId = useRef(0);
  const activeStation = station?.stationId === String(stationId) ? station : null;
  const activeStationState = stationState === "success" && !activeStation ? "loading" : stationState;

  useEffect(() => {
    const controller = new AbortController();
    const requestId = stationRequestId.current + 1;
    stationRequestId.current = requestId;
    poiRequestId.current += 1;
    routeRequestId.current += 1;
    setStationState("loading");
    setStation(null);
    setPois([]);
    setPoiState("loading");
    setSelectedPoi(null);
    setRoute(null);
    setRouteState("idle");
    adapter.loadStation(stationId, { signal: controller.signal })
      .then((value) => {
        if (requestId !== stationRequestId.current) return;
        setStation(value);
        setStationState("success");
      })
      .catch((error) => { if (error?.name !== "AbortError" && requestId === stationRequestId.current) setStationState("error"); });
    return () => controller.abort();
  }, [adapter, stationId, stationRetry]);

  useEffect(() => {
    if (!activeStation) return undefined;
    const controller = new AbortController();
    const requestId = poiRequestId.current + 1;
    poiRequestId.current = requestId;
    setPoiState("loading");
    setPois([]);
    setSelectedPoi(null);
    setRoute(null);
    setRouteState("idle");
    adapter.loadPois({ stationId, theme, signal: controller.signal })
      .then((values) => {
        if (requestId !== poiRequestId.current) return;
        setPois(values);
        setPoiState(values.length ? "success" : "empty");
      })
      .catch((error) => { if (error?.name !== "AbortError" && requestId === poiRequestId.current) setPoiState("error"); });
    return () => controller.abort();
  }, [activeStation, adapter, poiRetry, stationId, theme]);

  useEffect(() => {
    if (!activeStation || !selectedPoi) return undefined;
    const controller = new AbortController();
    const requestId = routeRequestId.current + 1;
    routeRequestId.current = requestId;
    const requestedMode = routeMode;
    setRoute(null);
    setRouteState("loading");
    adapter.loadRoute({ station: activeStation, poi: selectedPoi, routeMode, signal: controller.signal })
      .then((value) => {
        if (requestId !== routeRequestId.current) return;
        setRoute({ ...value, routeMode: requestedMode });
        setRouteState("success");
      })
      .catch((error) => { if (error?.name !== "AbortError" && requestId === routeRequestId.current) setRouteState("error"); });
    return () => controller.abort();
  }, [activeStation, adapter, routeMode, routeRetry, selectedPoi]);

  const selectPoi = useCallback((poi) => {
    routeRequestId.current += 1;
    setSelectedPoi(poi);
    setRoute(null);
    setRouteState("loading");
  }, []);

  const clearPoi = useCallback(() => {
    routeRequestId.current += 1;
    setSelectedPoi(null);
    setRoute(null);
    setRouteState("idle");
  }, []);

  const selectTheme = useCallback((value) => {
    if (value === theme) return;
    poiRequestId.current += 1;
    routeRequestId.current += 1;
    setPois([]);
    setPoiState("loading");
    setSelectedPoi(null);
    setRoute(null);
    setRouteState("idle");
    setTheme(value);
  }, [theme]);

  const selectRouteMode = useCallback((value) => {
    if (value === routeMode) return;
    routeRequestId.current += 1;
    setRoute(null);
    setRouteState("loading");
    setRouteMode(value);
  }, [routeMode]);

  const pageBusy = activeStationState === "loading";
  const mapRoute = routeState === "success" ? route : null;
  const title = activeStation?.name || "선택 대여소";
  const poiStatus = useMemo(() => ({
    empty: ["주변 장소가 없습니다", "이 테마에서 확인된 실제 장소가 없습니다. 다른 테마를 선택해 주세요."],
    error: ["주변 장소를 불러오지 못했습니다", "장소 제공자 연결을 확인한 뒤 다시 시도해 주세요."],
    loading: ["주변 장소를 찾는 중…", "선택 대여소 기준 실제 장소를 확인하고 있습니다."],
  })[poiState], [poiState]);

  return (
    <ConsumerR2Theme className="cr22-ride">
      <ConsumerAppHeader activeItem="ride" authState={authState} onAccount={() => onNavigate?.("mypage")} onLogin={() => onNavigate?.("login")} onNavigate={onNavigate} userName={user?.name} userTier={user?.tier} />
      <ConsumerContainer as="main" id="main-content" className="cr22-ride__content">
        <button className="cr22-ride__back" type="button" onClick={() => onNavigate?.("station", stationId)}><ConsumerIcon name="arrowRight" size={16} /> 선택 대여소로 돌아가기</button>
        <header className="cr22-ride__heading">
          <h1>Ride Explore</h1>
          <p>선택한 대여소에서 실제 주변 장소를 탐색하고 자전거 경로를 확인하세요.</p>
        </header>

        <AsyncState state={activeStationState} title={activeStationState === "loading" ? "대여소 정보를 확인하는 중…" : "대여소 정보를 불러오지 못했습니다"} description={activeStationState === "loading" ? "선택 대여소의 위치와 현재 상태를 확인하고 있습니다." : "대여소 위치를 확인한 뒤 다시 시도해 주세요."} onAction={activeStationState === "error" ? () => setStationRetry((value) => value + 1) : undefined}>
          {activeStationState === "success" ? <>
            <section className="cr22-ride__station" aria-label="선택 대여소"><ConsumerIcon name="mapPin" /><strong>{title}</strong><span>{stationInventory(activeStation)}</span></section>
            <div className="cr22-ride__theme-scroll" role="group" aria-label="주변 장소 테마">
              {RIDE_THEMES.map((value) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => selectTheme(value)}>{THEME_COPY[value]}</button>)}
            </div>

            <section className="cr22-ride__workspace" aria-label="주변 장소와 경로 탐색">
              <div className="cr22-ride__places">
                {poiState === "success" ? <ul>{pois.map((poi) => <PoiCard key={poi.placeId} poi={poi} theme={theme} selected={poi.placeId === selectedPoi?.placeId} onSelect={selectPoi} />)}</ul> : (
                  <AsyncState state={poiState} title={poiStatus?.[0]} description={poiStatus?.[1]} onAction={poiState === "error" ? () => setPoiRetry((value) => value + 1) : undefined} />
                )}
                <p className="cr22-ride__truth"><ConsumerIcon name="info" size={16} /> 표시된 장소는 실제 장소 제공자의 결과이며 AI 추천이나 임의 점수를 사용하지 않습니다.</p>
              </div>

              <div className="cr22-ride__route">
                <MapComponent station={activeStation} pois={pois} selectedPoi={selectedPoi} route={mapRoute} onSelectPoi={selectPoi} />
                {!selectedPoi ? <section className="cr22-ride__route-prompt"><ConsumerIcon name="bike" size={24} /><h2>자전거 경로를 볼 장소를 선택하세요</h2><p>선택한 한 곳에 대해서만 실제 경로를 요청합니다.</p></section> : <>
                  <section className="cr22-ride__selection"><div><strong>{selectedPoi.name}</strong><span>{selectedPoi.address || selectedPoi.category || "주소 정보 없음"}</span></div><button type="button" onClick={clearPoi}>다른 장소 선택</button></section>
                  <div className="cr22-ride__modes" role="group" aria-label="자전거 경로 방식">{RIDE_ROUTE_MODES.map((value) => <button key={value} type="button" aria-pressed={routeMode === value} onClick={() => selectRouteMode(value)}>{ROUTE_MODE_COPY[value]}</button>)}</div>
                  {routeState === "loading" ? <AsyncState state="loading" title="자전거 경로를 찾는 중…" description="실제 경로 제공자의 응답을 기다리고 있습니다." /> : null}
                  {routeState === "error" ? <AsyncState state="error" title="자전거 경로를 불러오지 못했습니다" description="장소는 확인되었지만 경로 제공자 연결에 실패했습니다." onAction={() => setRouteRetry((value) => value + 1)} /> : null}
                  {routeState === "success" ? <RouteSummary route={route} routeMode={route.routeMode} /> : null}
                </>}
              </div>
            </section>

            {selectedPoi && routeState === "success" ? <section className="cr22-ride__actions"><ConsumerButton variant="premium" onClick={() => onNavigate?.("guide", stationId)}><ConsumerIcon name="plan" /> Premium 라이딩 가이드</ConsumerButton><ConsumerButton variant="secondary" onClick={clearPoi}>다른 장소 선택</ConsumerButton></section> : null}
          </> : null}
        </AsyncState>
        {pageBusy ? <span className="cr22-sr-only">페이지 준비 중</span> : null}
      </ConsumerContainer>
    </ConsumerR2Theme>
  );
}
