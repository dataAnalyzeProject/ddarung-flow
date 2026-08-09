import { useState } from "react";
import PredictionCard from "./components/PredictionCard";
import PredictionDetails from "./components/PredictionDetails";
import { normalResult } from "./data/predictionResultMock";
import "./PredictionResults.css";

export default function PredictionResults({ result = normalResult, onEditInput = () => {}, onSelectStation = () => {} }) {
  const [selectedStationId, setSelectedStationId] = useState(result.selectedStationId ?? result.candidates[0]?.stationId ?? null);
  const [openDetailsId, setOpenDetailsId] = useState(null);

  if (!result.candidates?.length) return <main className="prediction-results-shell empty-state">
    <div><span>NO PREDICTION RESULT</span><h1>조건에 맞는 예측 결과가 없습니다.</h1><p>출발지, 목적지 또는 예상시간을 수정한 뒤 다시 확인해 주세요.</p><button type="button" onClick={onEditInput}>입력 수정</button></div>
  </main>;

  const selectedCandidate = result.candidates.find((candidate) => candidate.stationId === selectedStationId) ?? result.candidates[0];
  const alternatives = selectedCandidate.availabilityLevel === "LOW" ? result.candidates.filter((candidate) => candidate.stationId !== selectedCandidate.stationId).slice(0, 5) : [];
  const toggleDetails = (stationId) => setOpenDetailsId((current) => current === stationId ? null : stationId);
  const selectStation = (stationId) => {
    setSelectedStationId(stationId);
    onSelectStation(stationId);
  };

  return <main className="prediction-results-shell">
    <header className="prediction-results-header"><div><span>SEOUL BIKE</span><strong>따릉이 도착 대여 예측</strong></div><p>예측 결과 · 실제 대여를 보장하지 않습니다</p></header>
    <section className="prediction-results-heading"><div><p>PREDICTION COMPLETE</p><h1>목적지 주변 예측 결과</h1><span>후보별 도착시각과 {result.requiredBikeCount}대 대여 가능성을 비교하세요.</span></div></section>
    <section className="prediction-candidate-grid" aria-label="예측 후보 목록">
      {result.candidates.map((candidate) => <PredictionCard key={candidate.stationId} candidate={candidate} requiredBikeCount={result.requiredBikeCount} selected={candidate.stationId === selectedCandidate.stationId} onSelect={selectStation} onToggleDetails={toggleDetails} detailsOpen={openDetailsId === candidate.stationId} />)}
    </section>
    {openDetailsId && <PredictionDetails candidate={result.candidates.find((candidate) => candidate.stationId === openDetailsId)} />}
    {alternatives.length > 0 && <section className="prediction-alternatives"><header><div><span>LOW AVAILABILITY</span><h2>대체 대여소를 확인하세요.</h2></div><p>선택한 대여소의 가능성이 낮아 다른 후보를 안내합니다.</p></header><div>{alternatives.map((candidate) => <PredictionCard key={candidate.stationId} candidate={candidate} requiredBikeCount={result.requiredBikeCount} selected={false} onSelect={selectStation} onToggleDetails={toggleDetails} detailsOpen={openDetailsId === candidate.stationId} alternative />)}</div></section>}
    <footer className="prediction-results-footer"><p>{result.disclaimer}</p><span>요청 시각 {result.requestedAt}</span></footer>
  </main>;
}
