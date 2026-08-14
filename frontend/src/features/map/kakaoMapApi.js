const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
let sdkPromise;

export async function searchPlaces(query, { page = 1, size = 10 } = {}) {
  const params = new URLSearchParams({ query: query.trim(), page: String(page), size: String(size) });
  const response = await fetch(`${API_BASE_URL}/api/v1/places/search?${params}`);
  if (!response.ok) throw new Error(response.status === 400 ? "INVALID_PLACE_QUERY" : "PLACE_PROVIDER_ERROR");
  return response.json();
}

export async function estimateRoute(payload) {
  const response = await fetch(`${API_BASE_URL}/api/v1/routes/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(response.status === 400 ? "INVALID_ROUTE_REQUEST" : "ROUTE_PROVIDER_ERROR");
  return response.json();
}

export function loadKakaoMapSdk(appKey = process.env.REACT_APP_KAKAO_MAP_APP_KEY) {
  if (!appKey) return Promise.reject(new Error("KAKAO_MAP_KEY_MISSING"));
  if (window.kakao?.maps) return Promise.resolve(window.kakao.maps);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("kakao-map-sdk");
    const script = existing || document.createElement("script");
    const fail = () => reject(new Error("KAKAO_MAP_SDK_FAILED"));
    script.addEventListener("error", fail, { once: true });
    script.addEventListener("load", () => {
      if (!window.kakao?.maps) return fail();
      window.kakao.maps.load(() => resolve(window.kakao.maps));
    }, { once: true });
    if (!existing) {
      script.id = "kakao-map-sdk";
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=clusterer`;
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

export function createKakaoMapAdapter(container, maps, center = { latitude: 37.544, longitude: 127.056 }, markerOptions = {}) {
  const toLatLng = (point) => new maps.LatLng(point.latitude, point.longitude);
  const map = new maps.Map(container, { center: toLatLng(center), level: 5 });
  const markers = {};
  let stationMarkers = [];
  let stationClusterer = null;
  let stationOverlay = null;

  const createMarkerImage = (src, width, height) => {
    if (!src || !maps.MarkerImage) return undefined;
    return new maps.MarkerImage(src, new maps.Size(width, height), { offset: new maps.Point(Math.round(width / 2), height) });
  };

  const setMarker = (name, point, image) => {
    markers[name]?.setMap(null);
    if (!point) return;
    markers[name] = new maps.Marker({ map, position: toLatLng(point), image });
  };

  const clearStations = () => {
    stationClusterer?.clear();
    stationMarkers.forEach((marker) => marker.setMap(null));
    stationMarkers = [];
    stationClusterer = null;
    stationOverlay?.setMap(null);
    stationOverlay = null;
  };

  const createStationOverlay = (station) => {
    if (!maps.CustomOverlay || typeof document === "undefined") return;
    const content = document.createElement("section");
    const count = station.inventoryStatus === "LOADING"
      ? "재고 조회 중"
      : station.availableBikeCount === null ? (station.popupMessage || "재고 확인 필요") : `현재 ${station.availableBikeCount}대`;
    const inventoryStatus = station.inventoryStatus || "NORMAL";
    content.className = `station-map-popup ${inventoryStatus.toLowerCase()}`;
    content.innerHTML = `<strong></strong><span></span><small></small>`;
    content.querySelector("strong").textContent = station.name || station.stationName;
    content.querySelector("span").textContent = count;
    content.querySelector("small").textContent = `${station.collectedAt || "수집 시각 확인 필요"} 기준 · ${inventoryStatus}`;
    stationOverlay?.setMap(null);
    stationOverlay = new maps.CustomOverlay({ map, position: toLatLng(station), content, yAnchor: 1.45 });
  };

  const selectStation = (station, onStationSelected) => {
    map.panTo(toLatLng(station));
    onStationSelected?.(station);
  };

  return {
    setCenter(point) { if (point) map.setCenter(toLatLng(point)); },
    setPoints({ current, origin, destination }) {
      setMarker("current", current, createMarkerImage(markerOptions.currentMarkerImage, 32, 32));
      setMarker("origin", origin);
      setMarker("destination", destination);
      if (destination) map.setCenter(toLatLng(destination));
      else if (origin) map.setCenter(toLatLng(origin));
    },
    setStations(stations, onStationSelected = markerOptions.onStationSelected) {
      clearStations();
      const stationImage = createMarkerImage(markerOptions.stationMarkerImage, 30, 44);
      stationMarkers = stations.map((station) => {
        const marker = new maps.Marker({ position: toLatLng(station), image: stationImage });
        maps.event?.addListener(marker, "click", () => selectStation(station, onStationSelected));
        return marker;
      });
      if (maps.MarkerClusterer) stationClusterer = new maps.MarkerClusterer({ map, markers: stationMarkers, averageCenter: true, minLevel: 6 });
      else stationMarkers.forEach((marker) => marker.setMap(map));
    },
    showStationOverlay(station) { createStationOverlay(station); },
    setLevel(level) { map.setLevel(level); },
    setMapType(satellite) { map.setMapTypeId(satellite ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP); },
  };
}
