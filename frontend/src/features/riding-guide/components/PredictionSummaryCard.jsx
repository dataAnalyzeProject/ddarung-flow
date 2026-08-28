import { useEffect, useState } from "react";
import { AVAILABILITY_LABEL } from "../data/ridingGuideLabels";
import { formatClockTime, formatInventoryCount, formatPercent } from "../data/ridingGuideFormatters";
import { fetchPredictionReliability } from "../predictionReliabilityApi";

// 오른쪽 "대여 예측 요약" 카드는 왼쪽 종합 카드와 같은 퍼센트·등급을 중복 표시하지 않고,
// 이미 있는 필드만으로 "왜 이 결과가 나왔는지"를 문장으로 풀어준다.
export function buildPredictionNarrative(candidate) {
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

  const hasCount = count !== null && count !== undefined;
  const probabilitySentence = hasCount && percent
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

function PredictionEvidence({ candidate, requiredBikeCount }) {
  const [expanded, setExpanded] = useState(false);
  const [reliability, setReliability] = useState(null);

  useEffect(() => {
    if (!expanded || candidate?.selectedProbability == null || candidate?.horizonMinutes == null || requiredBikeCount == null) return undefined;
    let cancelled = false;
    setReliability(null);
    fetchPredictionReliability({
      horizonMinutes: candidate.horizonMinutes,
      requiredBikeCount,
      stationId: candidate.stationId,
      probability: candidate.selectedProbability,
    })
      .then((response) => {
        if (!cancelled) setReliability(response);
      })
      .catch(() => {
        if (!cancelled) setReliability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [candidate?.horizonMinutes, candidate?.selectedProbability, candidate?.stationId, expanded, requiredBikeCount]);

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
              {reliability && (
                <div className="guide-reliability" aria-label="예측 신뢰도">
                  {reliability.reliabilityLevel === "UNKNOWN" ? (
                    <p>검증 표본이 부족합니다</p>
                  ) : (
                    <>
                      <div>
                        <dt>이 구간 실측 적중률</dt>
                        <dd>{formatPercent(reliability.band?.accuracyRate)} <small>(표본 {reliability.band?.sampleCount?.toLocaleString()}건)</small></dd>
                      </div>
                      <div>
                        <dt>예측 신뢰도</dt>
                        <dd>{reliability.reliabilityLevel === "HIGH" ? "●●●●● 높음" : reliability.reliabilityLevel === "MEDIUM" ? "●●●○○ 보통" : "●○○○○ 낮음"}</dd>
                      </div>
                      <p>{reliability.disclosure}</p>
                    </>
                  )}
                </div>
              )}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

export default function PredictionSummaryCard({ candidate }) {
  const narrative = buildPredictionNarrative(candidate);

  return (
    <section className="guide-card guide-summary" aria-labelledby="summary-title">
      <h2 id="summary-title">대여 예측 요약</h2>
      <p className="guide-summary-narrative">{narrative}</p>
      <PredictionEvidence candidate={candidate} requiredBikeCount={candidate?.requiredBikeCount} />
    </section>
  );
}
