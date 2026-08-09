import { formatTime } from "./PredictionCard";

const probabilityLabels = ["1대 이상", "2대 이상", "3대 이상", "4대 이상", "5대 이상"];

export default function PredictionDetails({ candidate }) {
  return <section className="prediction-details" aria-label={`${candidate.stationName} 상세정보`}>
    <header><div><span>선택 대여소 상세</span><h3>{candidate.stationName}</h3></div><strong>{candidate.predictionStatus}</strong></header>
    <div className="prediction-probabilities">
      {probabilityLabels.map((label, index) => <div key={label}><span>{label}</span><div><i style={{ width: `${candidate.probabilities[`atLeast${index + 1}`] * 100}%` }} /></div><b>{Math.round(candidate.probabilities[`atLeast${index + 1}`] * 100)}%</b></div>)}
    </div>
    <dl className="prediction-meta">
      <div><dt>실제 도착시각</dt><dd>{formatTime(candidate.arrivalAt)}</dd></div>
      <div><dt>적용 정시</dt><dd>{formatTime(candidate.predictionTargetAt)} ({candidate.targetOffsetMinutes}분 차이)</dd></div>
      <div><dt>현재 재고 기준</dt><dd>{candidate.currentInventory.collectedAt}</dd></div>
      <div><dt>모델 입력 기준</dt><dd>{candidate.featureAsOf}</dd></div>
      <div><dt>예측 구간</dt><dd>{candidate.horizonMinutes}분</dd></div>
      <div><dt>모델 버전</dt><dd>{candidate.modelVersion}</dd></div>
      <div><dt>재고 상태</dt><dd>{candidate.currentInventory.inventoryStatus}</dd></div>
      <div><dt>예측 상태</dt><dd>{candidate.predictionStatus}</dd></div>
    </dl>
  </section>;
}
