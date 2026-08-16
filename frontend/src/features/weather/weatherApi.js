const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

function precipitationType(pty) {
  return ({ 0: "NONE", 1: "RAIN", 2: "RAIN_SNOW", 3: "SNOW", 4: "SHOWER" })[pty] || "NONE";
}

export function adaptArrivalWeather(response, location) {
  const status = response.status || "UNAVAILABLE";
  return {
    stationId: response.stationId,
    location,
    arrivalAt: response.arrivalAt,
    forecastAt: response.forecastAt,
    issuedAt: response.announcedAt,
    collectedAt: response.fetchedAt,
    status,
    temperatureC: response.temperature,
    precipitationProbabilityPercent: response.pop,
    precipitationType: precipitationType(response.pty),
    skyStatus: ({ "1": "CLEAR", "3": "MOSTLY_CLOUDY", "4": "OVERCAST" })[response.skyStatus] || response.skyStatus,
    rainGuidance: response.isRainy === true,
    message: status === "MISSING" ? "도착 예정시간의 날씨 예보가 없습니다."
      : status === "UNAVAILABLE" ? "날씨 예보를 불러오지 못했습니다."
      : status === "DELAYED" ? "날씨 발표가 지연되어 직전 발표 값을 표시합니다."
      : "",
    hourlyForecasts: (response.hourlyForecasts || []).map((item) => ({
      forecastAt: item.forecastAt,
      temperatureC: item.temperature,
      precipitationProbabilityPercent: item.pop,
      precipitationType: precipitationType(item.pty),
      skyStatus: ({ "1": "CLEAR", "3": "MOSTLY_CLOUDY", "4": "OVERCAST" })[item.skyStatus] || item.skyStatus,
    })),
  };
}

export async function fetchArrivalWeather({ latitude, longitude, arrivalAt }) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), arrivalAt });
  const response = await fetch(`${API_BASE_URL}/api/v1/weather/arrival?${params}`, { credentials: "include" });
  if (!response.ok) throw new Error("WEATHER_FETCH_FAILED");
  return response.json();
}
