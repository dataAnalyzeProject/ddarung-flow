import GuideIcon from "./GuideIcon";
import { PRECIP_TEXT, SKY_TEXT } from "../data/ridingGuideLabels";

// Fallback fixture: used only when no live arrivalWeather prop is supplied
// (e.g. the guide is opened without going through a prediction first).
export const weatherFixtureFallback = {
  status: "NORMAL",
  temperatureC: 24,
  precipitationProbabilityPercent: 10,
  precipitationType: "NONE",
  skyStatus: "CLEAR",
  rainGuidance: false,
  issuedAt: null,
};

export function weatherConditionText(weather) {
  if (weather.precipitationType && weather.precipitationType !== "NONE") {
    return PRECIP_TEXT[weather.precipitationType] || weather.precipitationType;
  }
  return SKY_TEXT[weather.skyStatus] || "맑음";
}

function WeatherLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="guide-air-loading" role="status">
      <span className="guide-air-skeleton" />
      <p>도착지 날씨를 불러오는 중이에요.</p>
    </div>
  );
}

function WeatherUnavailableNotice({ weather }) {
  const message = weather.message
    || (weather.status === "MISSING" ? "도착 예정시간의 날씨 예보가 없습니다." : "날씨 예보를 불러오지 못했습니다.");
  return (
    <div className="guide-air-unavailable" role="status">
      <GuideIcon name="warning" />
      <p>{message}</p>
    </div>
  );
}

export default function ArrivalWeatherCard({ weather, isLoading = false }) {
  return (
    <section className="guide-card guide-weather" aria-labelledby="arrival-weather-title">
      <h2 id="arrival-weather-title">도착지 날씨</h2>
      {isLoading ? (
        <WeatherLoading />
      ) : weather.status === "MISSING" || weather.status === "UNAVAILABLE" ? (
        <WeatherUnavailableNotice weather={weather} />
      ) : (
        <div className="guide-weather-body">
          <div className="guide-weather-summary">
            <div className="guide-sun" aria-label={weatherConditionText(weather)}><span /></div>
            <div className="guide-temperature">
              <strong>{weather.temperatureC === null || weather.temperatureC === undefined ? "-" : `${weather.temperatureC}°C`}</strong>
              <span>{weatherConditionText(weather)}</span>
            </div>
          </div>
          <dl>
            <div><dt><GuideIcon name="rain" />강수확률</dt><dd>{weather.precipitationProbabilityPercent === null || weather.precipitationProbabilityPercent === undefined ? "-" : `${weather.precipitationProbabilityPercent}%`}</dd></div>
            <div><dt><GuideIcon name="umbrella" />강수형태</dt><dd>{PRECIP_TEXT[weather.precipitationType] || "강수 없음"}</dd></div>
            <div><dt><GuideIcon name="air" />하늘상태</dt><dd>{SKY_TEXT[weather.skyStatus] || "-"}</dd></div>
            <div><dt><GuideIcon name="warning" />강수 가능성 안내</dt><dd>{weather.rainGuidance ? "있음" : "없음"}</dd></div>
          </dl>
          {weather.status === "DELAYED" && (
            <p className="guide-air-delayed-note" role="status">
              <GuideIcon name="info" />
              {weather.message || "날씨 발표가 지연되어 직전 발표 값을 표시합니다."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
