const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function fetchStation(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(response.status === 404 ? "STATION_NOT_FOUND" : "STATION_API_ERROR");
  return response.json();
}

export function fetchStationLocations() {
  return fetchStation("/api/v1/stations/locations");
}

export function fetchStationDetail(stationId) {
  return fetchStation(`/api/v1/stations/${encodeURIComponent(stationId)}`);
}
