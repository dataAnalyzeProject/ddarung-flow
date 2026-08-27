const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.code || (response.status === 401 ? "AUTH_REQUIRED" : response.status === 404 ? "RHYTHM_NOT_AVAILABLE" : "STATION_API_ERROR"));
  }
  return response.json();
}

export const fetchStationDetail = (stationId) => request(`/api/v1/stations/${encodeURIComponent(stationId)}`);
export const fetchStationRhythm = (stationId) => request(`/api/v1/stations/${encodeURIComponent(stationId)}/rhythm`);
