import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi.js";
import { fetchStationDetail as requestStationDetail, fetchStationLocations as requestStationLocations } from "../../station-detail/stationRhythmApi.js";
import currentLocationMarker from "../../map/assets/current-location-marker.png";
import bikeStationMarker from "../../map/assets/bike-station-marker.png";

export function locationErrorMessage(error) {
  if (error?.code === 1) return "현재 위치 권한이 거부되었습니다.";
  if (error?.code === 3) return "현재 위치 확인 시간이 초과되었습니다.";
  return "현재 위치를 확인할 수 없습니다.";
}

function inventoryOverlay(location, detail = {}) {
  const inventoryStatus = detail.inventoryStatus || "UNAVAILABLE";
  const countUnavailable = ["MISSING", "UNAVAILABLE"].includes(inventoryStatus)
    || !Number.isFinite(detail.availableBikeCount);
  const popupMessage = inventoryStatus === "MISSING" ? "재고 확인 필요"
    : inventoryStatus === "UNAVAILABLE" ? "재고 조회 불가"
      : countUnavailable ? "확인 필요" : undefined;
  return {
    ...location,
    ...detail,
    availableBikeCount: countUnavailable ? null : detail.availableBikeCount,
    collectedAt: detail.collectedAt || null,
    inventoryStatus,
    popupMessage,
  };
}

export default function ConsumerRouteMap({
  authState = "anonymous",
  candidate,
  destination,
  fetchStationDetail = requestStationDetail,
  fetchStationLocations = requestStationLocations,
  mapRenderer: MapRenderer,
  onStationDetail,
  origin,
}) {
  const containerRef = useRef(null);
  const adapterRef = useRef(null);
  const detailRequestRef = useRef(0);
  const locationsRequestRef = useRef(0);
  const showStationsRef = useRef(false);
  const authStateRef = useRef(authState);
  const originRef = useRef(origin);
  const onStationDetailRef = useRef(onStationDetail);
  const [mapState, setMapState] = useState("loading");
  const [current, setCurrent] = useState(null);
  const [locationState, setLocationState] = useState("idle");
  const [message, setMessage] = useState("");
  const [showStations, setShowStations] = useState(false);
  const [stationLocations, setStationLocations] = useState(null);
  const [stationLoadState, setStationLoadState] = useState("idle");
  const hasRouteDetail = Boolean(candidate?.routeDetail);
  const routeDestination = useMemo(() => (
    Number.isFinite(candidate?.latitude) && Number.isFinite(candidate?.longitude)
      ? { latitude: candidate.latitude, longitude: candidate.longitude }
      : destination
  ), [candidate?.latitude, candidate?.longitude, destination]);

  authStateRef.current = authState;
  originRef.current = origin;
  onStationDetailRef.current = onStationDetail;

  const handleStationSelected = useCallback(async (location) => {
    const requestId = ++detailRequestRef.current;
    adapterRef.current?.showStationOverlay({ ...location, availableBikeCount: null, collectedAt: null, inventoryStatus: "LOADING" });
    try {
      const detail = await fetchStationDetail(location.stationId);
      if (detailRequestRef.current !== requestId || !showStationsRef.current || authStateRef.current !== "authenticated") return;
      adapterRef.current?.showStationOverlay(inventoryOverlay(location, detail));
    } catch (error) {
      if (detailRequestRef.current !== requestId || !showStationsRef.current || authStateRef.current !== "authenticated") return;
      adapterRef.current?.showStationOverlay({
        ...location,
        availableBikeCount: null,
        collectedAt: null,
        inventoryStatus: "UNAVAILABLE",
        popupMessage: error?.message === "RHYTHM_NOT_AVAILABLE" ? "대여소 정보를 찾을 수 없습니다" : "재고 조회 불가",
      });
    }
  }, [fetchStationDetail]);

  useEffect(() => {
    if (MapRenderer || !hasRouteDetail || !containerRef.current) return undefined;
    let active = true;
    setMapState("loading");
    loadKakaoMapSdk()
      .then((maps) => {
        if (!active || !containerRef.current) return;
        adapterRef.current = createKakaoMapAdapter(containerRef.current, maps, originRef.current, {
          currentMarkerImage: currentLocationMarker,
          stationMarkerImage: bikeStationMarker,
          onStationSelected: handleStationSelected,
          onStationDetail: (stationId) => onStationDetailRef.current?.(stationId),
        });
        setMapState("ready");
      })
      .catch(() => active && setMapState("unavailable"));
    return () => {
      active = false;
      detailRequestRef.current += 1;
      locationsRequestRef.current += 1;
      adapterRef.current?.setStations([]);
      adapterRef.current = null;
    };
  }, [MapRenderer, handleStationSelected, hasRouteDetail]);

  useEffect(() => {
    if (mapState !== "ready") return;
    adapterRef.current?.setPoints({ current, origin, destination: routeDestination });
  }, [current, mapState, origin, routeDestination]);

  useEffect(() => {
    if (mapState === "ready") adapterRef.current?.setRoutePath(candidate.routeDetail.pathPoints);
  }, [candidate.routeDetail, mapState]);

  useEffect(() => {
    if (mapState !== "ready") return;
    adapterRef.current?.setStations(authState === "authenticated" && showStations && stationLocations ? stationLocations : [], handleStationSelected);
  }, [authState, handleStationSelected, mapState, showStations, stationLocations]);

  useEffect(() => {
    if (authState === "authenticated") return;
    detailRequestRef.current += 1;
    locationsRequestRef.current += 1;
    showStationsRef.current = false;
    setShowStations(false);
    setStationLocations(null);
    setStationLoadState("idle");
    adapterRef.current?.setStations([]);
  }, [authState]);

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
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const toggleStations = async () => {
    if (authState !== "authenticated") return;
    if (showStationsRef.current) {
      detailRequestRef.current += 1;
      locationsRequestRef.current += 1;
      showStationsRef.current = false;
      setShowStations(false);
      return;
    }
    showStationsRef.current = true;
    setShowStations(true);
    if (stationLocations) return;
    const requestId = ++locationsRequestRef.current;
    setStationLoadState("loading");
    setMessage("");
    try {
      const locations = await fetchStationLocations();
      if (locationsRequestRef.current !== requestId || !showStationsRef.current || authStateRef.current !== "authenticated") return;
      setStationLocations(Array.isArray(locations) ? locations : []);
      setStationLoadState("success");
      setMessage("");
    } catch {
      if (locationsRequestRef.current !== requestId || !showStationsRef.current || authStateRef.current !== "authenticated") return;
      showStationsRef.current = false;
      setShowStations(false);
      setStationLoadState("error");
      setMessage("대여소 위치를 불러오지 못했습니다.");
    }
  };

  if (MapRenderer) {
    return <MapRenderer authState={authState} candidate={candidate} destination={routeDestination} onStationDetail={onStationDetail} origin={origin} routeDetail={candidate?.routeDetail} />;
  }

  return (
    <div className="cr293-map" aria-label="선택한 대여소까지의 경로 지도">
      <div className="cr293-map__canvas" ref={containerRef} />
      <div className="cr293-map__controls" aria-label="지도 탐색 도구">
        <button type="button" disabled={mapState !== "ready" || locationState === "loading"} onClick={locate}>
          {locationState === "loading" ? "현재 위치 확인 중" : "내 위치"}
        </button>
        {authState === "authenticated" ? (
          <button type="button" aria-pressed={showStations} disabled={stationLoadState === "loading"} onClick={toggleStations}>
            {stationLoadState === "loading" ? "대여소 불러오는 중" : showStations ? "대여소 숨기기" : "대여소 표시"}
          </button>
        ) : null}
      </div>
      {message ? <p className="cr293-map__notice" role="status">{message}</p> : null}
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
