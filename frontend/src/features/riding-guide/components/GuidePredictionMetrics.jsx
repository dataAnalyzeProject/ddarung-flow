import { AVAILABILITY_LABEL } from "../data/ridingGuideLabels";
import { formatPercent } from "../data/ridingGuideFormatters";

const COUNTS = [1, 2, 3, 4, 5];
const AVAILABILITY_COLORS = { HIGH: "#059669", MEDIUM: "#d97706", LOW: "#e11d48" };

export function GuideSuccessRateCard({ candidate }) {
  const hasProbability = candidate?.predictionStatus === "NORMAL" && Number.isFinite(candidate?.selectedProbability);
  const percent = hasProbability ? Math.round(candidate.selectedProbability * 100) : null;
  const color = AVAILABILITY_COLORS[candidate?.availabilityLevel] || "#64748b";

  return (
    <section className="guide-card guide-success-rate" aria-labelledby="guide-success-rate-title">
      <h2 id="guide-success-rate-title">예상 대여 성공률</h2>
      <div className="guide-success-rate-body">
        <div aria-label={percent === null ? "예측을 불러올 수 없음" : `성공률 게이지 ${percent}%`} className="guide-success-rate-gauge" role="img" style={{ "--guide-rate-color": color, "--guide-rate": `${percent ?? 0}%` }}>
          <strong>{percent === null ? "-" : `${percent}%`}</strong>
        </div>
        <p>
          <b>{hasProbability ? (AVAILABILITY_LABEL[candidate.availabilityLevel] || "예측 결과") : "예측을 불러올 수 없음"}</b>
          <span>{candidate?.stationName ?? "선택한 대여소"} 기준</span>
          <em>{hasProbability ? "도착 시 대여 가능성을 확인했어요." : "다른 대여소나 이동 시간을 확인해 보세요."}</em>
        </p>
      </div>
    </section>
  );
}

export function GuideBikeCountCard({ candidate }) {
  return (
    <section className="guide-card guide-bike-count" aria-labelledby="guide-bike-count-title">
      <h2 id="guide-bike-count-title">대여수량별 예상 가능성</h2>
      {candidate?.probabilities ? (
        <div className="guide-bike-count-chart">
          {COUNTS.map((count) => {
            const percent = Math.round(candidate.probabilities[`atLeast${count}`] * 100);
            return <div key={count}><strong>{formatPercent(candidate.probabilities[`atLeast${count}`]) || "-"}</strong><i><b style={{ height: `${percent}%` }} /></i><span>{count}대 이상</span></div>;
          })}
        </div>
      ) : <p className="guide-prediction-empty">대수별 확률 정보가 없어요.</p>}
    </section>
  );
}
