import { formatStationTime } from "./StationRecommendationPanel";
import sunnyIcon from "../../../assets/weather/sunny.png";
import partlyCloudyIcon from "../../../assets/weather/partly-cloudy.png";
import cloudyIcon from "../../../assets/weather/cloudy.png";
import rainIcon from "../../../assets/weather/rain.png";
import snowIcon from "../../../assets/weather/snow.png";
import thunderstormIcon from "../../../assets/weather/thunderstorm.png";

const availabilityLabels = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };

const SKY_TEXT = { CLEAR: "맑음", MOSTLY_CLOUDY: "구름 많음", OVERCAST: "흐림" };
const PRECIPITATION_TEXT = { RAIN: "비", RAIN_SNOW: "비 또는 눈", SNOW: "눈", SHOWER: "소나기" };

function weatherConditionText(weather) {
  if (weather.precipitationType && weather.precipitationType !== "NONE") {
    return PRECIPITATION_TEXT[weather.precipitationType] || weather.precipitationType;
  }
  return SKY_TEXT[weather.skyStatus] || "맑음";
}

function weatherIcon(weather) {
  if (weather.skyStatus === "THUNDERSTORM") return thunderstormIcon;
  if (weather.precipitationType === "SNOW" || weather.precipitationType === "RAIN_SNOW") return snowIcon;
  if (weather.precipitationType === "RAIN" || weather.precipitationType === "SHOWER") return rainIcon;
  if (weather.skyStatus === "MOSTLY_CLOUDY") return partlyCloudyIcon;
  if (weather.skyStatus === "OVERCAST") return cloudyIcon;
  return sunnyIcon;
}

function HorizonOutlook({ candidate }) {
  const horizonOutlook = candidate?.horizonOutlook;
  if (!horizonOutlook) return null;

  return (
    <section className="main-horizon-outlook" aria-labelledby="main-horizon-outlook-title">
      <header>
        <h2 id="main-horizon-outlook-title">도착 시간대별 가능성</h2>
        <span>{candidate?.requiredBikeCount}대 기준</span>
      </header>
      <div className="main-horizon-outlook-list">
        {horizonOutlook.map((outlook) => {
          const percent = Number.isFinite(outlook.probability) ? Math.round(outlook.probability * 100) : null;
          return (
            <div className={`main-horizon-outlook-row${outlook.isSelected ? " is-selected" : ""}`} key={outlook.horizonMinutes} aria-current={outlook.isSelected ? "true" : undefined}>
              <span>{formatStationTime(outlook.predictionTargetAt)} (H{outlook.horizonMinutes / 60})</span>
              <i aria-label={percent === null ? "확률 정보 없음" : `${percent}%`}><b style={{ width: `${percent ?? 0}%` }} /></i>
              <strong>{percent === null ? "-" : `${percent}%`}</strong>
              <em>{availabilityLabels[outlook.availabilityLevel] ?? "-"}</em>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PredictionWeather({ weather, weatherLoading, onRetryWeather, arrivalAt }) {
  const isFailure = weather && (weather.status === "MISSING" || weather.status === "UNAVAILABLE");

  return (
    <section className="main-weather-section" aria-labelledby="main-weather-title">
      <header>
        <h2 id="main-weather-title">날씨 &amp; 추천 이동 팁</h2>
        <i className="main-info" aria-label="도움말" />
      </header>
      {!weather ? (
        <p className="main-tip" role="status">날씨 정보를 불러오는 중이에요.</p>
      ) : isFailure ? (
        <>
          <p className="main-tip" role="status">{weather.message}</p>
          {weather.status === "UNAVAILABLE" && (
            <button type="button" onClick={onRetryWeather} disabled={weatherLoading}>
              {weatherLoading ? "날씨 다시 불러오는 중" : "날씨 다시 시도"}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="main-weather">
            <img className="main-weather-icon" src={weatherIcon(weather)} alt={weatherConditionText(weather)} />
            <strong className="main-weather-temperature">{weather.temperatureC}°C<small>{weatherConditionText(weather)}</small></strong>
            <dl>
              <div><dt>강수확률</dt><dd>{weather.precipitationProbabilityPercent}%</dd></div>
              <div><dt>도착 예정</dt><dd>{formatStationTime(arrivalAt)}</dd></div>
            </dl>
          </div>
          <p className="main-tip">
            {weather.rainGuidance ? "도착 예정 시간대에 비 소식이 있어요. 우산을 챙기세요." : "날씨가 좋아 자전거 이용하기 좋은 날씨예요!"}
          </p>
        </>
      )}
    </section>
  );
}

export default function PredictionSummaryPanel({ candidates, selectedStationId, arrivalWeather, weatherLoading, onRetryWeather }) {
  const selectedCandidate = candidates.find((candidate) => candidate.stationId === selectedStationId) ?? candidates[0];

  return (
    <aside className="main-side-panels">
      <HorizonOutlook candidate={selectedCandidate} />

      <PredictionWeather
        weather={arrivalWeather}
        weatherLoading={weatherLoading}
        onRetryWeather={onRetryWeather}
        arrivalAt={selectedCandidate?.arrivalAt}
      />
    </aside>
  );
}
