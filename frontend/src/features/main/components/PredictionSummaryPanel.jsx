import { formatStationTime } from "./StationRecommendationPanel";

const availabilityLabels = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };

const AVAILABILITY_TIP = {
  HIGH: "도착 시 대여 가능성이 매우 높아요!",
  MEDIUM: "도착 시 대여 가능성이 보통이에요.",
  LOW: "도착 시 대여 가능성이 낮아요. 다른 대여소도 함께 확인해 보세요.",
};

const PROBABILITY_BARS = [1, 2, 3, 4, 5];

const SKY_TEXT = { CLEAR: "맑음", MOSTLY_CLOUDY: "구름 많음", OVERCAST: "흐림" };
const PRECIPITATION_TEXT = { RAIN: "비", RAIN_SNOW: "비 또는 눈", SNOW: "눈", SHOWER: "소나기" };

function weatherConditionText(weather) {
  if (weather.precipitationType && weather.precipitationType !== "NONE") {
    return PRECIPITATION_TEXT[weather.precipitationType] || weather.precipitationType;
  }
  return SKY_TEXT[weather.skyStatus] || "맑음";
}

function PredictionChart({ candidate }) {
  const probabilities = candidate?.probabilities;
  return (
    <section aria-labelledby="main-chart-title">
      <header><h2 id="main-chart-title">대여수량별 예상 가능성</h2></header>
      <div className="main-chart">
        <span>가능성</span>
        {PROBABILITY_BARS.map((count) => {
          const value = probabilities ? probabilities[`atLeast${count}`] : null;
          const height = value ? Math.round(value * 70) : 0;
          return (
            <i key={count} style={{ height }}>
              <b>{count}대</b>
            </i>
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
            <b aria-label={weatherConditionText(weather)} />
            <strong>{weather.temperatureC}°C<small>{weatherConditionText(weather)}</small></strong>
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

  return (
    <aside className="main-side-panels">
      <section aria-labelledby="main-success-title">
        <header><h2 id="main-success-title">예상 대여 성공률</h2></header>
        <div className="main-success">
          <strong>{Math.round((selectedCandidate?.selectedProbability ?? 0) * 100)}%</strong>
          <p>
            <b>{availabilityLabels[level] ?? "-"}</b>
            <span>{selectedCandidate?.stationName ?? "-"} 기준</span>
            <span>모델 {selectedCandidate?.modelVersion ?? "-"}</span>
            <em>{AVAILABILITY_TIP[level] ?? "선택한 대여소의 예측 결과를 확인하세요."}</em>
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
