const levelLabels = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };

export function probabilityFor(candidate, requiredBikeCount) {
  return candidate.probabilities?.[`atLeast${requiredBikeCount}`] ?? candidate.selectedProbability;
}

export function formatTime(value) {
  const [hourText, minute] = value.slice(11, 16).split(":");
  const hour = Number(hourText);
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${minute}`;
}

export default function PredictionCard({ candidate, requiredBikeCount, selected, onSelect, onToggleDetails, detailsOpen, alternative = false }) {
  const probability = probabilityFor(candidate, requiredBikeCount);
  const level = candidate.availabilityLevel;

  return <article className={`prediction-card level-${level.toLowerCase()} ${selected ? "selected" : ""} ${alternative ? "alternative" : ""}`}>
    <button className="prediction-card-main" type="button" onClick={() => onSelect(candidate.stationId)} aria-pressed={selected}>
      <header><span>{alternative ? "대체 후보" : candidate.stationId}</span><strong>{Math.round(probability * 100)}%</strong></header>
      <h3>{candidate.stationName}</h3>
      <p>{candidate.distanceMeters}m · 도보 {Math.round(candidate.durationSeconds / 60)}분</p>
      <div className="prediction-card-inventory"><b>{candidate.currentInventory.availableBikeCount ?? "-"}</b><span>현재 자전거<br />대</span></div>
      <dl><div><dt>실제 도착시각</dt><dd>{formatTime(candidate.arrivalAt)}</dd></div><div><dt>{requiredBikeCount}대 대여 가능성</dt><dd>{levelLabels[level]}</dd></div></dl>
      <small>적용 정시 {formatTime(candidate.predictionTargetAt)} · 차이 {candidate.targetOffsetMinutes}분</small>
    </button>
    <button className="prediction-detail-toggle" type="button" onClick={() => onToggleDetails(candidate.stationId)}>{detailsOpen ? "상세정보 접기 ↑" : "상세정보 펼치기 ↓"}</button>
  </article>;
}
