import { formatStationTime } from "./StationRecommendationPanel";
import sunnyIcon from "../../../assets/weather/sunny.png";
import partlyCloudyIcon from "../../../assets/weather/partly-cloudy.png";
import cloudyIcon from "../../../assets/weather/cloudy.png";
import rainIcon from "../../../assets/weather/rain.png";
import snowIcon from "../../../assets/weather/snow.png";
import thunderstormIcon from "../../../assets/weather/thunderstorm.png";

const availabilityLabels = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };
const availabilityColors = { HIGH: "#00a978", MEDIUM: "#e7a400", LOW: "#df5a55" };
const predictionStatusText = {
  MISSING: "재고 정보 없음",
  TOO_SOON: "예측 시간 범위 밖",
  UNAVAILABLE: "예측을 불러올 수 없음",
};

const AVAILABILITY_TIP = {
  HIGH: "도착 시 대여 가능성이 매우 높아요!",
  MEDIUM: "도착 시 대여 가능성이 보통이에요.",
  LOW: "도착 시 대여 가능성이 낮아요. 다른 대여소도 함께 확인해 보세요.",
};

const PROBABILITY_BARS = [1, 2, 3, 4, 5];
const GAUGE_CIRCUMFERENCE = 264;

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

function PredictionChart({ candidate }) {
  const probabilities = candidate?.probabilities;
  return (
    <section aria-labelledby="main-chart-title">
      <header><h2 id="main-chart-title">대여수량별 예상 가능성</h2></header>
      <div className="main-chart">
        {PROBABILITY_BARS.map((count) => {
          const value = probabilities ? probabilities[`atLeast${count}`] : null;
          const percent = Number.isFinite(value) ? Math.round(value * 100) : null;
          return (
            <div className="main-chart-column" key={count}>
              <strong>{percent === null ? "-" : `${percent}%`}</strong>
              <span className="main-chart-track"><i style={{ height: `${percent ?? 0}%` }} /></span>
              <b>{count}대 이상</b>
            </div>
          );
        })}
      </div>
      {!probabilities && <p className="main-tip">선택한 대여소의 대수별 확률 정보가 없어요.</p>}
    </section>
  );
}

function PredictionWeather({ weather, weatherLoading, onRetryWeather, arrivalAt }) {
  const isFailure = weather && (weather.status === "MISSING" || weather.status === "UNAVAILABLE");

  return (
    <section aria-labelledby="main-weather-title">
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
  const level = selectedCandidate?.availabilityLevel;
  const probability = selectedCandidate?.selectedProbability;
  const hasProbability = selectedCandidate?.predictionStatus === "NORMAL" && Number.isFinite(probability);
  const percentage = hasProbability ? Math.round(probability * 100) : null;
  const gaugeStyle = hasProbability ? {
    "--gauge-color": availabilityColors[level] || "#00a978",
    "--gauge-offset": `${GAUGE_CIRCUMFERENCE * (1 - percentage / 100)}`,
  } : undefined;
  const statusText = predictionStatusText[selectedCandidate?.predictionStatus] || "예측 결과를 확인하세요.";

  return (
    <aside className="main-side-panels">
      <section aria-labelledby="main-success-title">
        <header><h2 id="main-success-title">예상 대여 성공률</h2></header>
        <div className="main-success">
          <div
            aria-label={hasProbability ? `성공률 게이지 ${percentage}%` : statusText}
            className={`main-success-gauge ${hasProbability ? "" : "is-unavailable"}`}
            role="img"
            style={gaugeStyle}
          >
            <svg aria-hidden="true" viewBox="0 0 100 100">
              <circle className="main-success-gauge-track" cx="50" cy="50" r="42" />
              {hasProbability && <circle className="main-success-gauge-progress" cx="50" cy="50" r="42" />}
            </svg>
            <strong>{hasProbability ? `${percentage}%` : "-"}</strong>
          </div>
          <p>
            <b>{hasProbability ? availabilityLabels[level] : statusText}</b>
            <span>{selectedCandidate?.stationName ?? "-"} 기준</span>
            <em>{hasProbability ? AVAILABILITY_TIP[level] : "다른 대여소나 이동 시간을 확인해 보세요."}</em>
          </p>
        </div>
      </section>

      <PredictionChart candidate={selectedCandidate} />

      <PredictionWeather
        weather={arrivalWeather}
        weatherLoading={weatherLoading}
        onRetryWeather={onRetryWeather}
        arrivalAt={selectedCandidate?.arrivalAt}
      />
    </aside>
  );
}
