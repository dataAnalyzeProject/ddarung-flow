import "./WeatherCard.css";

const STATUS_TEXT = {
  DELAYED: "지연",
  MISSING: "예보 없음",
  UNAVAILABLE: "불러오기 실패",
};

const WEATHER_TEXT = {
  NONE: "강수 없음",
  RAIN: "비",
  RAIN_SNOW: "비 또는 눈",
  SNOW: "눈",
  SHOWER: "소나기",
};

const SKY_TEXT = {
  CLEAR: "맑음",
  MOSTLY_CLOUDY: "구름 많음",
  OVERCAST: "흐림",
};

function locationText(location) {
  if (typeof location === "string") return location;
  if (location && Number.isFinite(location.nx) && Number.isFinite(location.ny)) {
    return `격자 좌표 X ${location.nx} · Y ${location.ny}`;
  }
  return "위치 정보 없음";
}

function conditionText(precipitationType, skyStatus) {
  if (precipitationType && precipitationType !== "NONE") {
    return WEATHER_TEXT[precipitationType] || precipitationType;
  }
  return SKY_TEXT[skyStatus] || "강수 없음";
}

function timeText(value) {
  if (!value || !value.includes("T")) return "-";
  return value.split("T")[1].slice(0, 5);
}

function dateTimeText(value) {
  if (!value) return "-";
  const [date, time = ""] = value.split("T");
  return `${date} ${time.slice(0, 5)}`;
}

export default function WeatherCard({ weather, expanded = false, onToggle, onRetry, retrying = false }) {
  if (!weather) return null;

  const isFailure = weather.status === "MISSING" || weather.status === "UNAVAILABLE";
  const hourly = [...(weather.hourlyForecasts || [])].sort((a, b) =>
    a.forecastAt.localeCompare(b.forecastAt)
  );

  return (
    <section className={`weather-card status-${weather.status.toLowerCase()}`} aria-labelledby="weather-card-title">
      <header className="weather-card__header">
        <div>
          <p className="weather-card__eyebrow">ARRIVAL WEATHER</p>
          <h2 id="weather-card-title">도착 예정시간 날씨</h2>
          <p className="weather-card__location">{locationText(weather.location)}</p>
        </div>
        {STATUS_TEXT[weather.status] && (
          <span className="weather-card__status">{STATUS_TEXT[weather.status]}</span>
        )}
      </header>

      {isFailure ? (
        <>
          <p className="weather-card__message" role="status">{weather.message}</p>
          {weather.status === "UNAVAILABLE" && onRetry && (
            <button className="weather-card__toggle" type="button" onClick={onRetry} disabled={retrying}>
              {retrying ? "날씨 다시 불러오는 중" : "날씨 다시 시도"}
            </button>
          )}
        </>
      ) : (
        <>
          {weather.status === "DELAYED" && (
            <p className="weather-card__delay" role="status">
              {weather.message} 실제 발표시각 {dateTimeText(weather.issuedAt)}
            </p>
          )}

          <div className="weather-card__summary">
            <div><span>도착 예정</span><strong>{timeText(weather.arrivalAt)}</strong></div>
            <div><span>기온</span><strong>{weather.temperatureC}°C</strong></div>
            <div><span>강수확률</span><strong>{weather.precipitationProbabilityPercent}%</strong></div>
            <div><span>날씨</span><strong>{conditionText(weather.precipitationType, weather.skyStatus)}</strong></div>
          </div>

          {weather.rainGuidance === true && (
            <p className="weather-card__rain" role="note">
              도착 예정 시간대에 강수 가능성이 있습니다. 이동 전 날씨를 확인하세요.
            </p>
          )}

          <button
            className="weather-card__toggle"
            type="button"
            aria-expanded={expanded}
            aria-controls="hourly-weather-list"
            onClick={onToggle}
          >
            시간대별 예보 {expanded ? "접기" : "펼치기"}
          </button>

          {expanded && (
            <ul className="weather-card__hourly" id="hourly-weather-list" aria-label="시간대별 예보">
              {hourly.map((item) => (
                <li key={item.forecastAt}>
                  <time dateTime={item.forecastAt}>{timeText(item.forecastAt)}</time>
                  <strong>{item.temperatureC}°C</strong>
                  <span>강수 {item.precipitationProbabilityPercent}%</span>
                  <span>{conditionText(item.precipitationType, item.skyStatus)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <footer className="weather-card__footer">
        예보 기준 {dateTimeText(weather.forecastAt)} · 수집 {dateTimeText(weather.collectedAt)}
      </footer>
    </section>
  );
}
