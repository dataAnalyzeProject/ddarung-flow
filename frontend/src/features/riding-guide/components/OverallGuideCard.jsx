import GuideIcon from "./GuideIcon";
import { AVAILABILITY_LABEL } from "../data/ridingGuideLabels";
import { formatPercent } from "../data/ridingGuideFormatters";

export function getGuideAvailabilityMetric(candidate) {
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

export function getGuideRainMetric(arrivalWeather) {
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

export function computeOverallVerdict(candidate, arrivalWeather) {
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

export function computeIntroCopy(verdict) {
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

export default function OverallGuideCard({ verdict, metrics = [], onRouteBack }) {
  return (
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
        {metrics.map((metric) => (
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
      <button className="guide-route-back" type="button" onClick={onRouteBack}>
        <GuideIcon name="route" />
        경로 다시 보기
      </button>
    </section>
  );
}
