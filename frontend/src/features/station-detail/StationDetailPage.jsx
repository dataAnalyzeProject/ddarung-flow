import { useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { loadArchive, removeFavorite, saveFavorite } from "../archive/archiveApi";
import { fetchNearbyStations, fetchStationDetail, fetchStationRhythm } from "./stationRhythmApi";
import RhythmHeatmap from "./components/RhythmHeatmap";
import StationLocationMiniMap from "./components/StationLocationMiniMap";
import "./StationDetailPage.css";

const statusLabel = { NORMAL: "정상", DELAYED: "지연", MISSING: "수집 누락", UNAVAILABLE: "조회 불가" };
const duration = (minutes) => minutes == null ? "-" : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
const formatCollectedAt = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "수집 시각 확인 필요";

export function StationDetailView({ station, rhythm, nearby, favorite, error, authState, user, onNavigate, onLogout, onToggleFavorite }) {
  const stationName = station?.stationName || station?.name;
  const inventory = station?.inventoryStatus === "MISSING" ? "수집 누락" : station?.availableBikeCount == null ? "재고 확인 필요" : `${station.availableBikeCount}대`;
  return <div className="station-detail-shell">
    <AppHeader authState={authState} user={user} onNavigate={onNavigate} onLogout={onLogout} />
    <main className="station-detail">
      <nav className="station-breadcrumb" aria-label="현재 위치"><i aria-hidden="true">⌂</i> 대여 예측 <span>›</span> 대여소 상세</nav>
      {error && <p className="station-detail-error" role="alert">{error}</p>}
      {station && <>
        <section className="station-overview">
          <img src={require("../../assets/main/hero-search-background-v2.png")} alt="" aria-hidden="true" />
          <header className="station-detail-head"><h1>{stationName}</h1><button type="button" aria-pressed={Boolean(favorite)} onClick={onToggleFavorite}><i aria-hidden="true">★</i>{favorite ? "즐겨찾기 해제" : "즐겨찾기"}</button></header>
          <section className="station-now" aria-label="현재 대여소 재고"><div><span>현재 자전거 수</span><strong>{inventory}</strong></div><div><span>수집 시각</span><b>{formatCollectedAt(station.collectedAt)}</b></div><div><span>데이터 상태</span><b className={`station-status ${station.inventoryStatus?.toLowerCase() || "normal"}`}>{statusLabel[station.inventoryStatus] || "정상"}</b></div></section>
        </section>
        <div className="station-detail-grid">
          <div className="station-primary-column">
            <section className="station-rhythm station-card">
              <div className="station-card-heading"><div><h2>평소 패턴</h2><p>최근 90일 · 관측 {rhythm?.sampleCount?.toLocaleString() || "-"}건</p></div></div>
              {rhythm ? <><RhythmHeatmap cells={rhythm.weekdayHourly} /><div className="rhythm-legend"><span className="rhythm-gradient" aria-hidden="true" /><span>품절 관측률 낮음</span><span>품절 관측률 높음</span><i aria-hidden="true" /><span>관측 부족</span></div><p className="station-historical-notice"><i aria-hidden="true">i</i>최근 90일 관측 기준이며 미래를 예측한 값이 아닙니다.</p></> : <p className="station-empty-rhythm">평소 패턴 정보가 아직 없습니다.</p>}
            </section>
            <section className="station-nearby station-card"><h2>주변 대여소 3곳</h2>{nearby.length ? <ul>{nearby.map((item) => <li key={item.stationId}><b>{item.stationName || item.name}</b><button type="button" onClick={() => onNavigate?.("station", item.stationId)}>상세 보기</button></li>)}</ul> : <p className="station-empty-rhythm">주변 대여소 정보를 찾지 못했습니다.</p>}</section>
          </div>
          <aside className="station-side-column">
            <section className="station-recovery-card station-card"><h2>품절·회복 패턴</h2>{rhythm ? <dl><div><dt>한번 비면 보통</dt><dd>{duration(rhythm.stockout?.medianDurationMinutes)}</dd></div><div><dt>오래 걸리는 경우 (상위 10% 기준)</dt><dd>{duration(rhythm.stockout?.p90DurationMinutes)}</dd></div><div><dt>3대 이상 회복까지</dt><dd>{duration(rhythm.stockout?.medianRecoveryMinutesToThree)}</dd></div></dl> : <p className="station-empty-rhythm">확인할 관측 정보가 없습니다.</p>}</section>
            <StationLocationMiniMap station={station} />
          </aside>
        </div>
      </>}
    </main>
  </div>;
}

export default function StationDetailPage({ stationId, authState, user, onNavigate, onLogout }) {
  const [station, setStation] = useState(null); const [rhythm, setRhythm] = useState(null); const [nearby, setNearby] = useState([]); const [favorite, setFavorite] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    if (authState === "anonymous") { window.location.assign(`/login?returnTo=${encodeURIComponent(`#station/${stationId}`)}`); return; }
    if (authState !== "authenticated") return;
    fetchStationDetail(stationId).then((detail) => { setStation(detail); if (Number.isFinite(Number(detail.latitude)) && Number.isFinite(Number(detail.longitude))) fetchNearbyStations(Number(detail.latitude), Number(detail.longitude)).then((items) => setNearby(items.filter((item) => item.stationId !== detail.stationId).slice(0, 3))).catch(() => setNearby([])); loadArchive().then(([favorites]) => setFavorite(favorites.find((item) => item.stationId === Number(detail.stationNumber)) || null)).catch(() => {}); }).catch((e) => setError(e.message === "AUTH_REQUIRED" ? "로그인이 필요합니다." : "대여소 정보를 불러오지 못했습니다."));
    fetchStationRhythm(stationId).then(setRhythm).catch((e) => { if (e.message !== "RHYTHM_NOT_AVAILABLE") setError(e.message === "AUTH_REQUIRED" ? "로그인이 필요합니다." : "평소 패턴을 불러오지 못했습니다."); });
  }, [authState, stationId]);
  if (authState === "loading") return <p>로그인 정보를 확인하고 있습니다.</p>;
  const toggleFavorite = async () => { try { if (favorite) { await removeFavorite(favorite.id); setFavorite(null); } else { const favoriteStationId = Number(station.stationNumber); if (!Number.isSafeInteger(favoriteStationId)) throw new Error("INVALID_STATION_NUMBER"); setFavorite(await saveFavorite({ stationId: favoriteStationId, stationName: station.stationName || station.name })); } } catch (e) { setError(e.code === "FAVORITE_LIMIT_REACHED" ? "저장 대여소는 최대 20개까지 등록할 수 있습니다." : "즐겨찾기를 변경하지 못했습니다."); } };
  return <StationDetailView station={station} rhythm={rhythm} nearby={nearby} favorite={favorite} error={error} authState={authState} user={user} onNavigate={onNavigate} onLogout={onLogout} onToggleFavorite={toggleFavorite} />;
}
