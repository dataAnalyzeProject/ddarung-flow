import { useEffect, useMemo, useState } from "react";

const availabilityLabels = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };

const SORT_OPTIONS = [
  { value: "probability", label: "예상 대여 성공률 기준" },
  { value: "arrival", label: "예상 도착시간 빠른 순" },
];

const VISIBLE_STEP = 3;

export function formatStationTime(value) {
  if (!value) return "-";
  const [hourText, minute] = value.slice(11, 16).split(":");
  const hour = Number(hourText);
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${minute}`;
}

function sortCandidates(candidates, sortBy) {
  return [...candidates].sort((a, b) => {
    if (sortBy === "probability") {
      const probabilityDifference = b.selectedProbability - a.selectedProbability;
      if (probabilityDifference !== 0) return probabilityDifference;
    }
    const durationDifference = a.durationSeconds - b.durationSeconds;
    if (durationDifference !== 0) return durationDifference;
    const distanceDifference = a.distanceMeters - b.distanceMeters;
    if (distanceDifference !== 0) return distanceDifference;
    return a.stationId.localeCompare(b.stationId);
  });
}

function inventoryReferenceTime(candidates) {
  const collectedTimes = candidates
    .map((candidate) => candidate.currentInventory?.collectedAt)
    .filter(Boolean);
  return collectedTimes.length ? collectedTimes.sort()[0] : null;
}

export default function StationRecommendationPanel({ candidates, selectedStationId, onSelect, onViewGuide }) {
  const [sortBy, setSortBy] = useState("probability");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);
  const sortedCandidates = useMemo(() => sortCandidates(candidates, sortBy), [candidates, sortBy]);
  const referenceTime = useMemo(() => inventoryReferenceTime(candidates), [candidates]);
  const visibleCandidates = sortedCandidates.slice(0, visibleCount);
  const hasMore = visibleCount < sortedCandidates.length;

  useEffect(() => {
    setVisibleCount(VISIBLE_STEP);
  }, [candidates]);

  return (
    <section className="main-station-panel" aria-label="추천 대여소 목록">
      <header className="main-section-head">
        <h2>추천 대여소</h2>
        <span>{referenceTime ? `현재 재고 기준 ${formatStationTime(referenceTime)}` : "재고 기준시각 없음"}</span>
        <select aria-label="대여소 정렬" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </header>
      <div className="main-station-list">
        {visibleCandidates.map((candidate, index) => {
          const selected = candidate.stationId === selectedStationId;
          const level = candidate.availabilityLevel;
          return (
            <div aria-label={`${candidate.stationName} 대여소 카드`} className={`main-station ${selected ? "selected" : ""}`} key={candidate.stationId} role="group">
              <button aria-label={`${candidate.stationName} 대여소 선택`} aria-pressed={selected} className="main-station-select" type="button" onClick={() => onSelect(candidate.stationId)} />
              <b className="main-rank">{index + 1}</b>
              <span className="main-station-name">
                <h3>{candidate.stationName}</h3>
                {index === 0 && <em>추천</em>}
                <small>{candidate.distanceMeters}m · 도보 {Math.round(candidate.durationSeconds / 60)}분</small>
              </span>
              <span className="main-station-stat">
                <small>현재 자전거</small>
                <strong>{candidate.currentInventory.availableBikeCount ?? "-"}<i>대</i></strong>
              </span>
              <span className="main-station-stat">
                <small>예상 도착시각</small>
                <strong>{formatStationTime(candidate.arrivalAt)}</strong>
              </span>
              <span className="main-station-rate">
                <small>예상 대여 성공률</small>
                <b aria-label={`성공률 ${Math.round(candidate.selectedProbability * 100)}%`}>{Math.round(candidate.selectedProbability * 100)}%</b>
                <em>{availabilityLabels[level] ?? "-"}</em>
              </span>
              <button aria-label={`${candidate.stationName} 상세보기`} className="main-details" type="button" onClick={() => onViewGuide(candidate)}>상세보기</button>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button className="main-more" type="button" onClick={() => setVisibleCount((count) => count + VISIBLE_STEP)}>
          더 많은 대여소 보기⌄
        </button>
      )}
    </section>
  );
}
