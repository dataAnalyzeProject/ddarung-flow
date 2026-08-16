const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

export async function fetchAirQuality(stationId) {
  const response = await fetch(`${API_BASE_URL}/api/v1/stations/${stationId}/air-quality`, {
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }
  if (response.status === 404) {
    throw new Error("STATION_NOT_FOUND");
  }
  if (!response.ok) {
    throw new Error("AIR_QUALITY_FETCH_FAILED");
  }
  return response.json();
}
