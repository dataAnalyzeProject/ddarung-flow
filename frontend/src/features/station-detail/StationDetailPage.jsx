import { useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { fetchStationDetail, fetchStationRhythm } from "./stationRhythmApi";
import RhythmHeatmap from "./components/RhythmHeatmap";
import "./StationDetailPage.css";

const statusLabel = { NORMAL: "정상", DELAYED: "지연", MISSING: "수집 누락", UNAVAILABLE: "조회 불가" };
const duration = (minutes) => minutes == null ? "-" : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
export default function StationDetailPage({ stationId, authState, user, onNavigate, onLogout }) {
  const [station, setStation] = useState(null); const [rhythm, setRhythm] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    if (authState === "anonymous") { window.location.assign(`/login?returnTo=${encodeURIComponent(`#station/${stationId}`)}`); return; }
    if (authState !== "authenticated") return;
    fetchStationDetail(stationId).then(setStation).catch((e) => setError(e.message === "AUTH_REQUIRED" ? "로그인이 필요합니다." : "대여소 정보를 불러오지 못했습니다."));
    fetchStationRhythm(stationId).then(setRhythm).catch((e) => { if (e.message !== "RHYTHM_NOT_AVAILABLE") setError(e.message === "AUTH_REQUIRED" ? "로그인이 필요합니다." : "평소 패턴을 불러오지 못했습니다."); });
  }, [authState, stationId]);
  if (authState === "loading") return <p>로그인 정보를 확인하고 있습니다.</p>;
  return <div className="station-detail-shell"><AppHeader authState={authState} user={user} onNavigate={onNavigate} onLogout={onLogout} /><main className="station-detail">{error && <p role="alert">{error}</p>}{station && <><h1>◆ {station.stationName || station.name}</h1><section className="station-now"><b>지금</b><strong>{station.inventoryStatus === "MISSING" ? "수집 누락" : station.availableBikeCount == null ? "재고 확인 필요" : `${station.availableBikeCount}대`}</strong><span>{station.collectedAt || "수집 시각 확인 필요"} · {statusLabel[station.inventoryStatus] || "정상"}</span></section>{rhythm && <section className="station-rhythm"><h2>평소 패턴</h2><p>최근 90일 · 관측 {rhythm.sampleCount?.toLocaleString()}건</p><RhythmHeatmap cells={rhythm.weekdayHourly} /><p>최근 90일 관측 기준이며 미래를 예측한 값이 아닙니다.</p><dl><div><dt>한번 비면 보통</dt><dd>{duration(rhythm.stockout?.medianDurationMinutes)} (p90 {duration(rhythm.stockout?.p90DurationMinutes)})</dd></div><div><dt>3대 이상 회복까지</dt><dd>{duration(rhythm.stockout?.medianRecoveryMinutesToThree)}</dd></div></dl></section>}</>}</main></div>;
}
