import { useState } from "react";
import AppHeader from "../../shared/AppHeader";
import "./RidingGuidePage.css";
import {
  AIR_QUALITY_GRADE_LABEL,
  airQualityNormalFixture,
} from "./data/airQualityMock";

// Fallback fixtures: used only when no live candidate/weather prop is supplied
// (e.g. the guide is opened without going through a prediction first).
const hourlyFixture = [
  { time: "09시", temperature: "21°C", rain: "10%", condition: "추천", tone: "safe" },
  { time: "11시", temperature: "24°C", rain: "10%", condition: "추천", tone: "safe", current: true },
  { time: "13시", temperature: "26°C", rain: "20%", condition: "추천", tone: "safe" },
  { time: "15시", temperature: "25°C", rain: "30%", condition: "주의", tone: "caution" },
  { time: "17시", temperature: "23°C", rain: "50%", condition: "주의", tone: "caution" },
];

const weatherFixtureFallback = {
  status: "NORMAL",
  temperatureC: 24,
  precipitationProbabilityPercent: 10,
  precipitationType: "NONE",
  skyStatus: "CLEAR",
  rainGuidance: false,
  issuedAt: null,
};

const AVAILABILITY_LABEL = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };
const SKY_TEXT = { CLEAR: "맑음", MOSTLY_CLOUDY: "구름 많음", OVERCAST: "흐림" };
const PRECIP_TEXT = { NONE: "강수 없음", RAIN: "비", RAIN_SNOW: "비 또는 눈", SNOW: "눈", SHOWER: "소나기" };

const iconPaths = {
  arrow: "M15 4l-8 8 8 8M7 12h14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.7-3.4 3.1-5 7-5s6.3 1.6 7 5",
  bike: "M7 17a4 4 0 1 1-4-4 4 4 0 0 1 4 4Zm14 0a4 4 0 1 1-4-4 4 4 0 0 1 4 4ZM7 17l4-8 4 8M9 11h7l-2-4h-3M15 17h2l-3-8",
  rain: "M7 16h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.2 1.5A3.4 3.4 0 0 0 7 16Zm2 3-1 2m5-2-1 2m5-2-1 2",
  wind: "M3 8h11c2.5 0 2.5-4 0-4m-11 8h16c2.8 0 2.8-4 0-4m-16 8h10c2.8 0 2.8 4 0 4",
  air: "M12 4v.01M6.3 6.3v.01m11.4 0v.01M4 12v.01m16 0v.01M6.3 17.7v.01m11.4 0v.01M12 20v.01",
  leaf: "M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16ZM5 21c2-5 6-8 11-10",
  route: "M6 9c2-2.4 3-4.1 3-5.2a3 3 0 1 0-6 0C3 4.9 4 6.6 6 9Zm12 12c2-2.4 3-4.1 3-5.2a3 3 0 1 0-6 0c0 1.1 1 2.8 3 5.2ZM6 9c0 5 12 2 12 7",
  thermometer: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0ZM12 8v9",
  umbrella: "M4 11a8 8 0 0 1 16 0H4Zm8 0v7c0 3 4 3 4 0",
  info: "M12 11v6m0-10h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  warning: "M12 4 3 20h18L12 4Zm0 5v5m0 3h.01",
  transit: "M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2Zm-2 8h16M7 20l2-4m8 4-2-4M8 8h3m2 0h3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v5l3 2",
  status: "M5 5h14v14H5V5Zm3 7 2.5 2.5L16 9",
};

function GuideIcon({ name, className = "", title }) {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={`guide-icon ${className}`}
      fill="none"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[name] || iconPaths.info} />
    </svg>
  );
}

const AIR_QUALITY_GRADE_TONE = {
  GOOD: "safe-text",
  MODERATE: "caution-text",
  BAD: "warn-text",
  VERY_BAD: "danger-text",
};

function formatClockTime(isoString) {
  if (!isoString) return null;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatPercent(value) {
  return value === null || value === undefined ? null : `${Math.round(value * 100)}%`;
}

function getGuideKhaiMetric(airQuality, isLoading) {
  const hidden = { icon: "air", label: "통합대기환경지수", value: "-", note: "정보 없음", tone: "" };
  if (isLoading || !airQuality) return hidden;
  if (airQuality.status === "MISSING" || airQuality.status === "UNAVAILABLE") return hidden;
  const hasValue = airQuality.khai && airQuality.khai.value !== null && airQuality.khai.value !== undefined;
  if (!hasValue) return hidden;
  return {
    icon: "air",
    label: "통합대기환경지수",
    value: String(airQuality.khai.value),
    note: AIR_QUALITY_GRADE_LABEL[airQuality.khai.grade] || "-",
    tone: airQuality.khai.grade === "GOOD" ? "safe" : "caution",
  };
}

function getGuideAvailabilityMetric(candidate) {
  if (!candidate) {
    return { icon: "bike", label: "대여 가능성", value: "87%", note: "매우 높음", tone: "safe" };
  }
  const level = candidate.availabilityLevel;
  return {
    icon: "bike",
    label: "대여 가능성",
    value: formatPercent(candidate.selectedProbability) ?? "-",
    note: AVAILABILITY_LABEL[level] || "정보 없음",
    tone: level === "LOW" ? "caution" : "safe",
  };
}

function getGuideRainMetric(arrivalWeather) {
  if (!arrivalWeather) {
    return { icon: "rain", label: "강수확률", value: "10%", note: "낮음", tone: "blue" };
  }
  if (arrivalWeather.status === "MISSING" || arrivalWeather.status === "UNAVAILABLE") {
    return { icon: "rain", label: "강수확률", value: "-", note: "정보 없음", tone: "" };
  }
  const pct = arrivalWeather.precipitationProbabilityPercent;
  return {
    icon: "rain",
    label: "강수확률",
    value: pct === null || pct === undefined ? "-" : `${pct}%`,
    note: arrivalWeather.rainGuidance ? "주의" : "낮음",
    tone: arrivalWeather.rainGuidance ? "caution" : "blue",
  };
}

function computeOverallVerdict(candidate, arrivalWeather) {
  if (!candidate) {
    return {
      rating: "좋음",
      ringPercent: 87,
      message: (
        <>지금 출발하면<br />자전거 이용을 <span>추천해요.</span></>
      ),
    };
  }
  const status = candidate.predictionStatus;
  const percent = Math.round((candidate.selectedProbability ?? 0) * 100);
  if (status && status !== "NORMAL" && status !== "DELAYED") {
    return {
      rating: "확인 필요",
      ringPercent: 0,
      message: (
        <>대여 가능성을 아직 확인할 수 없어요.<br />잠시 후 <span>다시 확인해주세요.</span></>
      ),
    };
  }
  if (candidate.availabilityLevel === "LOW" || arrivalWeather?.rainGuidance === true) {
    return {
      rating: "주의",
      ringPercent: percent,
      message: (
        <>대여 가능성과 날씨를 확인하고<br />이용을 <span>결정해주세요.</span></>
      ),
    };
  }
  return {
    rating: "좋음",
    ringPercent: percent,
    message: (
      <>지금 출발하면<br />자전거 이용을 <span>추천해요.</span></>
    ),
  };
}

function formatInventoryCount(inventory) {
  if (!inventory) return "정보 없음";
  if (inventory.inventoryStatus === "MISSING") return "정보 없음";
  if (inventory.inventoryStatus === "UNAVAILABLE") return "조회 불가";
  if (inventory.availableBikeCount === null || inventory.availableBikeCount === undefined) return "정보 없음";
  return `${inventory.availableBikeCount}대`;
}

// 오른쪽 "대여 예측 요약" 카드는 왼쪽 종합 카드와 같은 퍼센트·등급을 중복 표시하지 않고,
// 이미 있는 필드만으로 "왜 이 결과가 나왔는지"를 문장으로 풀어준다.
function buildPredictionNarrative(candidate) {
  if (!candidate) {
    return "실제 예측을 실행하면 이 대여소의 선택 수량 확률과 현재 재고, 예측 기준 시각을 근거로 보여드려요.";
  }

  const status = candidate.predictionStatus;
  if (status === "TOO_SOON") return "아직 예측 가능한 시점이 아니라 확률을 계산하지 않았어요.";
  if (status === "MISSING") return "이 시점의 예측 결과가 없어요.";
  if (status === "UNAVAILABLE") return "지금은 예측을 사용할 수 없어요.";

  const count = candidate.requiredBikeCount;
  const percent = formatPercent(candidate.selectedProbability);
  const levelLabel = AVAILABILITY_LABEL[candidate.availabilityLevel];
  const inventoryCount = formatInventoryCount(candidate.currentInventory);
  const collectedTime = formatClockTime(candidate.currentInventory?.collectedAt);
  const arrivalTime = formatClockTime(candidate.arrivalAt);
  const targetTime = formatClockTime(candidate.predictionTargetAt);

  const probabilitySentence = count && percent
    ? `${count}대 이상 빌릴 수 있을 확률이 ${percent}${levelLabel ? `(${levelLabel})` : ""}예요.`
    : percent
      ? `선택 수량 기준 확률이 ${percent}${levelLabel ? `(${levelLabel})` : ""}예요.`
      : "";

  const inventorySentence = inventoryCount === "정보 없음" || inventoryCount === "조회 불가"
    ? "현재 재고 정보를 확인할 수 없어요."
    : collectedTime
      ? `현재 ${inventoryCount}가 있어요(${collectedTime} 수집).`
      : `현재 ${inventoryCount}가 있어요.`;

  const targetSentence = arrivalTime && targetTime
    ? `도착 예정 ${arrivalTime}에 가장 가까운 정시 ${targetTime} 기준으로 예측했어요.`
    : "";

  return [probabilitySentence, inventorySentence, targetSentence].filter(Boolean).join(" ");
}

function buildHourlyRows(arrivalWeather) {
  if (!arrivalWeather || !Array.isArray(arrivalWeather.hourlyForecasts) || arrivalWeather.hourlyForecasts.length === 0) {
    return null;
  }
  const sorted = [...arrivalWeather.hourlyForecasts].sort((a, b) => a.forecastAt.localeCompare(b.forecastAt));
  const arrivalHourKey = arrivalWeather.arrivalAt ? arrivalWeather.arrivalAt.slice(0, 13) : null;
  return sorted.slice(0, 5).map((item) => {
    const rainy = (item.precipitationType && item.precipitationType !== "NONE") || (item.precipitationProbabilityPercent ?? 0) >= 50;
    const hour = item.forecastAt && item.forecastAt.includes("T") ? item.forecastAt.split("T")[1].slice(0, 2) : "--";
    return {
      time: `${hour}시`,
      temperature: item.temperatureC === null || item.temperatureC === undefined ? "-" : `${item.temperatureC}°C`,
      rain: item.precipitationProbabilityPercent === null || item.precipitationProbabilityPercent === undefined ? "-" : `${item.precipitationProbabilityPercent}%`,
      condition: rainy ? "주의" : "추천",
      tone: rainy ? "caution" : "safe",
      current: item.forecastAt ? item.forecastAt.slice(0, 13) === arrivalHourKey : false,
    };
  });
}

function weatherConditionText(weather) {
  if (weather.precipitationType && weather.precipitationType !== "NONE") {
    return PRECIP_TEXT[weather.precipitationType] || weather.precipitationType;
  }
  return SKY_TEXT[weather.skyStatus] || "맑음";
}

function AirQualityValue({ label, pollutant, unit }) {
  const hasValue = pollutant && pollutant.value !== null && pollutant.value !== undefined;
  const tone = hasValue ? AIR_QUALITY_GRADE_TONE[pollutant.grade] || "" : "";
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {hasValue ? (
          <>
            <span>{pollutant.value}</span>
            <small>{unit}</small>
            <em className={tone}>{AIR_QUALITY_GRADE_LABEL[pollutant.grade] || "-"}</em>
          </>
        ) : (
          <span aria-label={`${label} 측정값 없음`}>-</span>
        )}
      </dd>
    </div>
  );
}

function AirQualityLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="guide-air-loading" role="status">
      <span className="guide-air-skeleton" />
      <p>대기질 정보를 불러오는 중이에요.</p>
    </div>
  );
}

function AirQualityUnavailableNotice({ status }) {
  const message =
    status === "MISSING"
      ? "측정값이 없어 대기질을 표시할 수 없어요."
      : "대기질 정보를 조회할 수 없어요.";
  return (
    <div className="guide-air-unavailable" role="status">
      <GuideIcon name="warning" />
      <p>{message}</p>
    </div>
  );
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

function PredictionEvidence({ candidate, requiredBikeCount }) {
  const [expanded, setExpanded] = useState(false);
  if (!candidate) return null;

  const status = candidate.predictionStatus;
  const arrivalTime = formatClockTime(candidate.arrivalAt);
  const targetTime = formatClockTime(candidate.predictionTargetAt);
  const featureAsOf = formatClockTime(candidate.featureAsOf);
  const horizonHours = candidate.horizonMinutes ? Math.round(candidate.horizonMinutes / 60) : null;

  return (
    <div className="guide-summary-evidence">
      {(arrivalTime || targetTime) && (
        <p className="guide-summary-meta">
          실제 도착 <strong>{arrivalTime || "-"}</strong> · 적용 정시 <strong>{targetTime || "-"}</strong>
          {candidate.targetOffsetMinutes !== null && candidate.targetOffsetMinutes !== undefined
            ? ` (${candidate.targetOffsetMinutes}분 차이)`
            : ""}
        </p>
      )}

      {status === "TOO_SOON" && <p className="guide-summary-meta">아직 예측 가능한 시점이 아니에요.</p>}
      {status === "MISSING" && <p className="guide-summary-meta">예측 결과가 없어요.</p>}
      {status === "UNAVAILABLE" && <p className="guide-summary-meta">지금은 예측을 사용할 수 없어요.</p>}

      {candidate.probabilities && (
        <>
          <button
            className="guide-summary-toggle"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            1~5대 누적확률 {expanded ? "접기" : "보기"}
          </button>
          {expanded && (
            <dl className="guide-summary-detail">
              {[1, 2, 3, 4, 5].map((count) => (
                <div className={count === requiredBikeCount ? "current" : ""} key={count}>
                  <dt>{count}대 이상</dt>
                  <dd>{formatPercent(candidate.probabilities[`atLeast${count}`]) || "-"}</dd>
                </div>
              ))}
              <div>
                <dt>모델 기준</dt>
                <dd>
                  {featureAsOf ? `${featureAsOf} 기준` : "-"}
                  {horizonHours ? ` · H${horizonHours}` : ""}
                </dd>
              </div>
              {candidate.modelVersion && (
                <div>
                  <dt>모델 버전</dt>
                  <dd>{candidate.modelVersion}</dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

function computeIntroCopy(verdict) {
  if (verdict.rating === "주의") {
    return {
      badge: "이용 시 주의",
      summary: "대여 가능성이나 날씨·대기질 상황을 확인하고 이용해주세요.",
    };
  }
  if (verdict.rating === "확인 필요") {
    return {
      badge: "정보 확인 중",
      summary: "예측 정보를 아직 확인할 수 없어요. 잠시 후 다시 확인해주세요.",
    };
  }
  return {
    badge: "자전거 이용 추천",
    summary: "대여 가능성이 높고 날씨와 대기질도 자전거 이용에 적합해요.",
  };
}

function formatDistance(meters) {
  if (meters === null || meters === undefined) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

function findRainStartHour(arrivalWeather) {
  if (!arrivalWeather || !Array.isArray(arrivalWeather.hourlyForecasts)) return null;
  const sorted = [...arrivalWeather.hourlyForecasts].sort((a, b) => a.forecastAt.localeCompare(b.forecastAt));
  const rainyItem = sorted.find((item) =>
    (item.precipitationType && item.precipitationType !== "NONE") || (item.precipitationProbabilityPercent ?? 0) >= 50
  );
  if (!rainyItem || !rainyItem.forecastAt || !rainyItem.forecastAt.includes("T")) return null;
  return { hourLabel: `${rainyItem.forecastAt.split("T")[1].slice(0, 2)}시`, pop: rainyItem.precipitationProbabilityPercent };
}

function buildWarnings(candidate, arrivalWeather, airQuality) {
  const items = [];

  if (candidate?.availabilityLevel === "LOW") {
    items.push({
      key: "availability",
      icon: "bike",
      text: "이 대여소는 대여 가능성이 낮아요 — 대체 대여소를 확인해보세요.",
    });
  }

  if (candidate?.currentInventory?.inventoryStatus === "DELAYED") {
    const time = formatClockTime(candidate.currentInventory.collectedAt);
    items.push({
      key: "inventory-delayed",
      icon: "clock",
      text: time ? `재고 정보가 지연되고 있어요(최근 확인 ${time}).` : "재고 정보가 지연되고 있어요.",
    });
  }

  const rainStart = findRainStartHour(arrivalWeather);
  if (rainStart) {
    items.push({ key: "rain", icon: "rain", text: `${rainStart.hourLabel}부터 강수확률 ${rainStart.pop}%로 올라요.` });
  } else if (arrivalWeather?.rainGuidance === true) {
    items.push({ key: "rain", icon: "rain", text: "도착 예정 시간대에 강수 가능성이 있어요." });
  }

  const grade = airQuality?.khai?.grade;
  const pm10Value = airQuality?.pm10?.value;
  if (grade === "MODERATE" || grade === "BAD" || grade === "VERY_BAD") {
    const gradeLabel = AIR_QUALITY_GRADE_LABEL[grade];
    items.push({
      key: "air",
      dots: true,
      text: pm10Value !== null && pm10Value !== undefined
        ? `PM10 ${pm10Value}㎍/㎥ ${gradeLabel} — 민감군 장시간 이용 주의`
        : `미세먼지 ${gradeLabel} — 민감군 장시간 이용 주의`,
    });
  }

  items.push({ key: "info", icon: "info", text: "예보와 측정값은 갱신 시점에 따라 달라질 수 있어요." });
  return items;
}

export default function RidingGuidePage({
  stationName = "성수역 3번 출구",
  candidate = null,
  arrivalWeather = null,
  isWeatherLoading = false,
  onBack,
  onNavigate,
  airQuality = airQualityNormalFixture,
  isAirQualityLoading = false,
}) {
  const returnToPrediction = () => onBack?.();
  const airQualityMeasuredTime = formatClockTime(airQuality?.measuredAt);
  const weatherData = arrivalWeather || weatherFixtureFallback;
  const guideMetricsWithAirQuality = [
    getGuideAvailabilityMetric(candidate),
    getGuideRainMetric(arrivalWeather),
    getGuideKhaiMetric(airQuality, isAirQualityLoading),
  ];
  const verdict = computeOverallVerdict(candidate, arrivalWeather);
  const hourlyRows = buildHourlyRows(arrivalWeather) || hourlyFixture;
  const warnings = buildWarnings(candidate, arrivalWeather, airQuality);
  const predictionNarrative = buildPredictionNarrative(candidate);
  const weatherIssuedTime = formatClockTime(weatherData.issuedAt);
  const predictionUpdatedTime = candidate?.predictionGeneratedAt ? formatClockTime(candidate.predictionGeneratedAt) : null;
  const dataStateOk = !(candidate && ["MISSING", "UNAVAILABLE"].includes(candidate.predictionStatus))
    && weatherData.status !== "UNAVAILABLE";
  const introCopy = computeIntroCopy(verdict);
  const airQualityDistanceText = formatDistance(airQuality?.measurementStationDistanceMeters);

  return (
    <main className="riding-guide-shell">
      <AppHeader onHome={onBack} onNavigate={onNavigate} />

      <div className="guide-page">
        <button className="guide-back" type="button" onClick={returnToPrediction}>
          <GuideIcon name="arrow" />
          대여 예측으로 돌아가기
        </button>

        <section className="guide-intro" aria-labelledby="riding-guide-title">
          <div className="guide-intro-title">
            <div>
              <h1 id="riding-guide-title">{stationName} 라이딩 가이드</h1>
              <p>도착 예정시간 {formatClockTime(candidate?.arrivalAt) || "11:05"} 기준</p>
            </div>
            <span className="guide-badge">{introCopy.badge}</span>
          </div>
          <div className="guide-intro-copy">
            <strong>{introCopy.summary}</strong>
            <p>
              기상청 · 에어코리아 · 따릉이 예측 데이터
              <GuideIcon name="info" title="화면 데이터 출처 안내" />
            </p>
          </div>
        </section>

        <div className="guide-dashboard">
          <section className="guide-card guide-overall" id="guide-overall" aria-labelledby="overall-title">
            <h2 id="overall-title">종합 라이딩 가이드</h2>
            <div className="guide-overall-verdict">
              <div
                className="guide-rating-ring"
                style={{ background: `conic-gradient(var(--guide-green) 0 ${verdict.ringPercent}%, #deeee6 ${verdict.ringPercent}% 100%)` }}
              >
                <strong>{verdict.rating}</strong>
              </div>
              <p>{verdict.message}</p>
            </div>
            <dl className="guide-metrics">
              {guideMetricsWithAirQuality.map((metric) => (
                <div key={metric.label}>
                  <span className={`guide-metric-icon ${metric.tone}`}><GuideIcon name={metric.icon} /></span>
                  <dt>{metric.label}</dt>
                  <dd className={metric.tone}>{metric.value} <small>· {metric.note}</small></dd>
                </div>
              ))}
            </dl>
            <div className="guide-eco-tip">
              <GuideIcon name="leaf" />
              <p><strong>오후 6시 전까지 이용하기 좋아요.</strong><span>장거리 이동 시에는 미세먼지 변화를 확인하세요.</span></p>
            </div>
            <button className="guide-route-back" type="button" onClick={returnToPrediction}>
              <GuideIcon name="route" />
              경로 다시 보기
            </button>
          </section>

          <section className="guide-center-column" aria-label="시간대별 날씨와 대기질">
            <section className="guide-card guide-hourly" aria-labelledby="hourly-title">
              <header className="guide-card-heading">
                <h2 id="hourly-title">시간대별 라이딩 환경</h2>
                <p><span className="safe" />추천 <span className="caution" />주의</p>
              </header>
              <div className="guide-hourly-timeline" aria-label="시간대별 변화">
                <span aria-hidden="true" />
                {hourlyRows.map((hour) => (
                  <div className={hour.current ? "current" : ""} key={hour.time}>
                    <span>{hour.time}</span>
                    <i className={hour.tone} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div className="guide-hourly-table-wrap">
                <table className="guide-hourly-table">
                  <caption className="sr-only">시간대별 기온, 강수확률과 라이딩 환경</caption>
                  <tbody>
                    <tr><th scope="row">기온 (°C)</th>{hourlyRows.map((hour) => <td aria-label={`${hour.time} ${hour.temperature}`} className={hour.current ? "current safe-text" : ""} key={hour.time}>{hour.temperature}</td>)}</tr>
                    <tr><th scope="row">강수확률 (%)</th>{hourlyRows.map((hour) => <td aria-label={`${hour.time} 강수확률 ${hour.rain}`} className={`${hour.current ? "current safe-text" : ""} ${hour.tone === "caution" ? "caution-text" : ""}`} key={hour.time}>{hour.rain}</td>)}</tr>
                    <tr><th scope="row">라이딩 환경</th>{hourlyRows.map((hour) => <td aria-label={`${hour.time} 라이딩 환경 ${hour.condition}`} className={hour.current ? "current" : ""} key={hour.time}><span className={`guide-condition ${hour.tone}`}>{hour.condition}</span></td>)}</tr>
                  </tbody>
                </table>
              </div>
            </section>

            <div className="guide-arrival-grid">
              <section className="guide-card guide-weather" aria-labelledby="arrival-weather-title">
                <h2 id="arrival-weather-title">도착지 날씨</h2>
                {isWeatherLoading ? (
                  <WeatherLoading />
                ) : weatherData.status === "MISSING" || weatherData.status === "UNAVAILABLE" ? (
                  <WeatherUnavailableNotice weather={weatherData} />
                ) : (
                  <div className="guide-weather-body">
                    <div className="guide-weather-summary">
                      <div className="guide-sun" aria-label={weatherConditionText(weatherData)}><span /></div>
                      <div className="guide-temperature">
                        <strong>{weatherData.temperatureC === null || weatherData.temperatureC === undefined ? "-" : `${weatherData.temperatureC}°C`}</strong>
                        <span>{weatherConditionText(weatherData)}</span>
                      </div>
                    </div>
                    <dl>
                      <div><dt><GuideIcon name="rain" />강수확률</dt><dd>{weatherData.precipitationProbabilityPercent === null || weatherData.precipitationProbabilityPercent === undefined ? "-" : `${weatherData.precipitationProbabilityPercent}%`}</dd></div>
                      <div><dt><GuideIcon name="umbrella" />강수형태</dt><dd>{PRECIP_TEXT[weatherData.precipitationType] || "강수 없음"}</dd></div>
                      <div><dt><GuideIcon name="air" />하늘상태</dt><dd>{SKY_TEXT[weatherData.skyStatus] || "-"}</dd></div>
                      <div><dt><GuideIcon name="warning" />강수 가능성 안내</dt><dd>{weatherData.rainGuidance ? "있음" : "없음"}</dd></div>
                    </dl>
                    {weatherData.status === "DELAYED" && (
                      <p className="guide-air-delayed-note" role="status">
                        <GuideIcon name="info" />
                        {weatherData.message || "날씨 발표가 지연되어 직전 발표 값을 표시합니다."}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="guide-card guide-air" aria-labelledby="arrival-air-title">
                <h2 id="arrival-air-title">도착지 대기질</h2>
                {isAirQualityLoading || !airQuality ? (
                  <AirQualityLoading />
                ) : airQuality.status === "MISSING" || airQuality.status === "UNAVAILABLE" ? (
                  <AirQualityUnavailableNotice status={airQuality.status} />
                ) : (
                  <>
                    <div className="guide-air-body">
                      <div
                        className="guide-air-dots"
                        aria-label={`통합대기환경지수 ${AIR_QUALITY_GRADE_LABEL[airQuality.khai?.grade] || "정보 없음"}`}
                      >
                        <span />
                      </div>
                      <dl className="guide-air-values">
                        <AirQualityValue label="PM10" pollutant={airQuality.pm10} unit="㎍/㎥" />
                        <AirQualityValue label="PM2.5" pollutant={airQuality.pm25} unit="㎍/㎥" />
                        <AirQualityValue label="오존 (O₃)" pollutant={airQuality.o3} unit="ppm" />
                      </dl>
                    </div>
                    <dl className="guide-air-meta">
                      <div><dt>측정소</dt><dd>{airQuality.measurementStation}</dd></div>
                      {airQualityDistanceText && (
                        <div><dt>대여소와의 거리</dt><dd>{airQualityDistanceText}</dd></div>
                      )}
                      <div><dt>측정시간</dt><dd>{airQualityMeasuredTime ? `${airQualityMeasuredTime} 기준` : "-"}</dd></div>
                    </dl>
                    {airQuality.status === "DELAYED" && (
                      <p className="guide-air-delayed-note" role="status">
                        <GuideIcon name="info" />
                        측정값 갱신이 지연되고 있어요.
                      </p>
                    )}
                  </>
                )}
              </section>
            </div>
          </section>

          <aside className="guide-side-column" aria-label="대여 예측과 이용 안내">
            <section className="guide-card guide-summary" aria-labelledby="summary-title">
              <h2 id="summary-title">대여 예측 요약</h2>
              <p className="guide-summary-narrative">{predictionNarrative}</p>
              <PredictionEvidence candidate={candidate} requiredBikeCount={candidate?.requiredBikeCount} />
            </section>

            <section className="guide-card guide-warnings" aria-labelledby="warnings-title">
              <h2 id="warnings-title">주의사항</h2>
              <ul>
                {warnings.map((item) => (
                  <li key={item.key}>
                    {item.dots ? <span className="guide-small-dots" aria-hidden="true" /> : <GuideIcon name={item.icon} />}
                    {item.text}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        <footer className="guide-status" aria-label="데이터 상태">
          <span>
            <GuideIcon name="status" /><b>데이터 상태</b>
            {dataStateOk ? <><i className="guide-status-ok">✓</i> 정상</> : <><GuideIcon name="warning" /> 일부 정보 없음</>}
          </span>
          <span><i className="guide-status-spinner" /><b>날씨 발표</b>{weatherIssuedTime || "10:00"}</span>
          <span><GuideIcon name="air" /><b>대기질 측정</b>{isAirQualityLoading || !airQuality ? "-" : airQualityMeasuredTime || "-"}</span>
          <span><GuideIcon name="clock" /><b>대여 예측 갱신</b>{predictionUpdatedTime || "10:32"}</span>
          <span className="guide-status-note"><GuideIcon name="info" />실시간 측정값과 예측 결과는 실제 상황과 다를 수 있습니다.</span>
        </footer>
      </div>
    </main>
  );
}
