const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

export const RIDE_THEMES = ["PARK", "RIVER", "CAFE", "ATTRACTION", "CULTURE", "FOOD"];
export const RIDE_ROUTE_MODES = ["BIKE_ONLY", "ACCESSIBLE", "SHORTEST"];

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const fallback = response.status === 404
      ? "STATION_NOT_FOUND"
      : response.status === 400
        ? "INVALID_RIDE_REQUEST"
        : "RIDE_PROVIDER_ERROR";
    throw new Error(body.code || fallback);
  }
  return response.json();
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStation(value) {
  const latitude = finiteNumber(value?.latitude);
  const longitude = finiteNumber(value?.longitude);
  const stationId = value?.stationId;
  const name = value?.name || value?.stationName;
  if (!stationId || !name || latitude === null || longitude === null) {
    throw new Error("STATION_LOCATION_UNAVAILABLE");
  }
  return { ...value, stationId: String(stationId), name, latitude, longitude };
}

function normalizePoi(value) {
  const latitude = finiteNumber(value?.latitude);
  const longitude = finiteNumber(value?.longitude);
  const distanceMeters = finiteNumber(value?.distanceMeters);
  if (!value?.placeId || !value?.name || latitude === null || longitude === null || distanceMeters === null || distanceMeters < 0) {
    throw new Error("PLACE_PROVIDER_RESPONSE_INVALID");
  }
  return {
    ...value,
    placeId: String(value.placeId),
    latitude,
    longitude,
    distanceMeters,
  };
}

function normalizeRoute(value, routeMode) {
  const distanceMeters = finiteNumber(value?.distanceMeters);
  const durationSeconds = finiteNumber(value?.durationSeconds);
  const pathPoints = Array.isArray(value?.pathPoints) ? value.pathPoints.map((point) => ({
    latitude: finiteNumber(point?.latitude),
    longitude: finiteNumber(point?.longitude),
  })) : [];
  const validPath = pathPoints.length >= 2 && pathPoints.every((point) => point.latitude !== null && point.longitude !== null);
  if (value?.travelMode !== "BICYCLE" || distanceMeters === null || distanceMeters < 0 || durationSeconds === null || durationSeconds < 0 || !validPath) {
    throw new Error("ROUTE_PROVIDER_RESPONSE_INVALID");
  }
  return { ...value, distanceMeters, durationSeconds, pathPoints, routeMode };
}

async function requestStation(stationId, { signal } = {}) {
  return request(`/api/v1/stations/${encodeURIComponent(stationId)}`, { signal });
}

async function requestPois({ stationId, theme, signal }) {
  const params = new URLSearchParams({ stationId: String(stationId), theme, limit: "5" });
  return request(`/api/v1/places/nearby?${params}`, { signal });
}

async function requestRoute({ station, poi, routeMode, signal }) {
  return request("/api/v1/routes/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originLatitude: station.latitude,
      originLongitude: station.longitude,
      destinationLatitude: poi.latitude,
      destinationLongitude: poi.longitude,
      travelMode: "BICYCLE",
      routeMode,
    }),
    signal,
  });
}

export function createConsumerRideAdapter(dependencies = {}) {
  const api = { requestPois, requestRoute, requestStation, ...dependencies };
  return {
    async loadStation(stationId, options) {
      const station = normalizeStation(await api.requestStation(stationId, options));
      if (station.stationId !== String(stationId)) throw new Error("STATION_ID_MISMATCH");
      return station;
    },
    async loadPois({ stationId, theme, signal }) {
      if (!RIDE_THEMES.includes(theme)) throw new Error("INVALID_RIDE_THEME");
      const values = await api.requestPois({ stationId, theme, signal });
      if (!Array.isArray(values)) throw new Error("PLACE_PROVIDER_RESPONSE_INVALID");
      return values.slice(0, 5).map(normalizePoi);
    },
    async loadRoute({ station, poi, routeMode, signal }) {
      if (!RIDE_ROUTE_MODES.includes(routeMode)) throw new Error("INVALID_RIDE_ROUTE_MODE");
      return normalizeRoute(await api.requestRoute({ station, poi, routeMode, signal }), routeMode);
    },
  };
}

export const consumerRideAdapter = createConsumerRideAdapter();
