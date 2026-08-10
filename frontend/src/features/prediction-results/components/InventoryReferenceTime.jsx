import { formatTime } from "./PredictionCard";

const statusLabels = {
  NORMAL: "정상",
  DELAYED: "일부 지연",
  MISSING: "일부 누락",
  UNAVAILABLE: "이용 불가",
};

export default function InventoryReferenceTime({ referenceTime, status = "NORMAL" }) {
  return (
    <div className={`inventory-reference-time status-${status.toLowerCase()}`}>
      <span>전체 현재 재고 기준</span>
      <strong>{referenceTime ? formatTime(referenceTime) : "기준시각 없음"}</strong>
      <small>{statusLabels[status] ?? status}</small>
    </div>
  );
}
