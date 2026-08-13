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
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

export function createKakaoMapAdapter(container, maps, center = { latitude: 37.5665, longitude: 126.978 }) {
  const toLatLng = (point) => new maps.LatLng(point.latitude, point.longitude);
  const map = new maps.Map(container, { center: toLatLng(center), level: 5 });
  const markers = {};

  const setMarker = (name, point) => {
    markers[name]?.setMap(null);
    if (!point) return;
    markers[name] = new maps.Marker({ map, position: toLatLng(point) });
  };

  return {
    setCenter(point) { if (point) map.setCenter(toLatLng(point)); },
    setPoints({ current, origin, destination }) {
      setMarker("current", current);
      setMarker("origin", origin);
      setMarker("destination", destination);
      if (destination) map.setCenter(toLatLng(destination));
      else if (origin) map.setCenter(toLatLng(origin));
    },
    setLevel(level) { map.setLevel(level); },
    setMapType(satellite) { map.setMapTypeId(satellite ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP); },
  };
}
