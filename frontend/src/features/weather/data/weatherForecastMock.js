const baseHourly = [
  { forecastAt: "2026-08-11T18:00:00+09:00", temperatureC: 27, precipitationProbabilityPercent: 30, precipitationType: "NONE", skyStatus: "MOSTLY_CLOUDY" },
  { forecastAt: "2026-08-11T19:00:00+09:00", temperatureC: 26, precipitationProbabilityPercent: 50, precipitationType: "RAIN", skyStatus: "OVERCAST" },
  { forecastAt: "2026-08-11T20:00:00+09:00", temperatureC: 25, precipitationProbabilityPercent: 60, precipitationType: "RAIN", skyStatus: "OVERCAST" },
];

export const normalWeather = {
  stationId: "ST-1",
  arrivalAt: "2026-08-11T18:20:00+09:00",
  forecastAt: "2026-08-11T18:00:00+09:00",
  source: "APPROVED_MOCK",
  location: { nx: 60, ny: 127 },
  issuedAt: "2026-08-11T14:00:00+09:00",
  collectedAt: "2026-08-11T14:05:00+09:00",
  status: "NORMAL",
  temperatureC: 27,
  precipitationProbabilityPercent: 30,
  precipitationType: "NONE",
  skyStatus: "MOSTLY_CLOUDY",
  rainGuidance: false,
  message: "",
  hourlyForecasts: baseHourly,
};

export const rainyWeather = {
  ...normalWeather,
  precipitationProbabilityPercent: 50,
  precipitationType: "RAIN",
  skyStatus: "OVERCAST",
  rainGuidance: true,
};

export const delayedWeather = {
  ...rainyWeather,
  status: "DELAYED",
  message: "날씨 발표가 지연되어 직전 발표 값을 표시합니다.",
};

export const missingWeather = {
  ...normalWeather,
  status: "MISSING",
  rainGuidance: false,
  message: "도착 예정시간의 날씨 예보가 없습니다.",
  hourlyForecasts: [],
};

export const unavailableWeather = {
  ...normalWeather,
  status: "UNAVAILABLE",
  rainGuidance: false,
  message: "날씨 예보를 불러오지 못했습니다.",
  hourlyForecasts: [],
};

export const weatherForecastMock = {
  normal: normalWeather,
  rainy: rainyWeather,
  delayed: delayedWeather,
  missing: missingWeather,
  unavailable: unavailableWeather,
};
