import { useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { BikePinIcon } from "./icons";
import { loadArchive, removeFavorite, removePredictionHistory, removeSavedRoute } from "./archiveApi";
import "./ArchivePage.css";

const TABS = [
  { id: "stations", label: "저장 대여소" },
  { id: "routes", label: "저장 경로" },
  { id: "history", label: "예측 이력" },
];

export default function ArchivePage({ authState, user, onNavigate, onBeforeLogin, onLogout }) {
  const [tab, setTab] = useState("stations");
  const [stations, setStations] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [histories, setHistories] = useState([]);
  const [scoreSummary, setScoreSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadArchive()
      .then(([favorites, savedRoutes, predictionHistories, predictionScoreSummary]) => {
        setStations(favorites);
        setRoutes(savedRoutes);
        setHistories(predictionHistories);
        setScoreSummary(predictionScoreSummary);
      })
      .catch((requestError) => setError(requestError.status === 401 ? "auth-required" : requestError.code || "보관함을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const remove = async (kind, id) => {
    try {
      if (kind === "station") {
        await removeFavorite(id);
        setStations((current) => current.filter((item) => item.id !== id));
      } else if (kind === "route") {
        await removeSavedRoute(id);
        setRoutes((current) => current.filter((item) => item.id !== id));
      } else {
        const deleted = histories.find((item) => item.id === id);
        await removePredictionHistory(id);
        setHistories((current) => current.filter((item) => item.id !== id));
        if (deleted?.outcome === "HIT" || deleted?.outcome === "MISS") setScoreSummary((current) => removeScore(current, deleted));
      }
    } catch (requestError) {
      setError(requestError.code || "삭제하지 못했습니다.");
    }
  };

  const savedCount = stations.length + routes.length + histories.length;
  const restoreRoute = (route) => {
    if (!route.replayable || !route.routeInput) return;
    sessionStorage.setItem("ddarung.savedRouteRestore.v1", JSON.stringify(route.routeInput));
    onNavigate?.("main");
  };

  return (
    <div className="archive-shell">
      <AppHeader activeRoute="archive" authState={authState} user={user} onNavigate={onNavigate} onBeforeLogin={onBeforeLogin} onLogout={onLogout} />
      <main className="archive-content">
        <div className="archive-head">
          <div><h1 className="archive-title">내 보관함</h1><p className="archive-subtitle">저장한 대여소와 경로, 예측 이력을 한곳에서 확인하세요.</p></div>
          <p className="archive-saved-count">저장 항목 <b>{savedCount}</b>개</p>
        </div>
        <div className="archive-tabs" role="tablist" aria-label="보관함 분류">
          {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>
        {loading && <p role="status" className="archive-note">보관함을 불러오는 중입니다.</p>}
        {error === "auth-required" && <section role="alert" className="archive-note"><h2>로그인이 필요합니다</h2><p>보관함을 확인하려면 로그인해 주세요.</p><a href="/login">로그인하기</a></section>}
        {error && error !== "auth-required" && <p role="alert" className="archive-note">{error}</p>}
        {!loading && !error && tab === "stations" && <div className="archive-grid">
          {stations.map((station) => <article className="archive-card station-card" key={station.id}>
            <div className="station-top"><div className="station-pin"><BikePinIcon color="#08a36f" /></div><div><span className="station-label">대여소</span><button type="button" className="station-name" onClick={() => onNavigate?.("station", station.stationId)}>{station.stationName || `대여소 ${station.stationId}`}</button><div className="station-meta">대여소 ID {station.stationId}</div></div></div>
            <div className="station-actions"><button type="button" className="archive-btn" onClick={() => onNavigate?.("station", station.stationId)}>상세보기</button><button type="button" className="archive-btn danger" onClick={() => remove("station", station.id)}>삭제</button></div>
          </article>)}
          {!stations.length && <section className="archive-card archive-placeholder"><h2>저장한 대여소가 없습니다.</h2><p>지도에서 대여소를 저장하면 이곳에서 확인할 수 있습니다.</p></section>}
          <aside className="archive-card summary-card"><h2>보관함 요약</h2><div className="summary-row"><span>저장 대여소</span><b style={{ color: "#08a36f" }}>{stations.length}</b></div><div className="summary-row"><span>저장 경로</span><b style={{ color: "#0875ef" }}>{routes.length}</b></div><div className="summary-row"><span>예측 이력</span><b style={{ color: "#ff8700" }}>{histories.length}</b></div><button type="button" className="archive-find-btn" onClick={() => onNavigate?.("main")}>대여소 찾기</button></aside>
        </div>}
        {!loading && !error && tab === "routes" && <ArchiveList title="저장 경로" items={routes} empty="저장한 경로가 없습니다." format={(route) => route.displayName ? `${route.displayName}${route.replayable ? " · 입력 복원 가능" : " · 이전 형식"}` : `${route.startStationName || route.startStationId} → ${route.endStationName || route.endStationId}`} onRemove={(id) => remove("route", id)} onRestore={restoreRoute} />}
        {!loading && !error && tab === "history" && <PredictionHistoryList items={histories} scoreSummary={scoreSummary} onRemove={(id) => remove("history", id)} />}
        <div className="archive-note"><span className="note-icon">i</span><span>예측 이력은 요청 당시의 조건이며 현재 결과가 아닙니다.</span></div>
      </main>
    </div>
  );
}

function removeScore(summary, history) {
  if (!summary || summary.scoredCount <= 1) return null;
  const byLevel = { ...summary.byLevel };
  const level = history.availabilityLevel;
  if (byLevel[level]) byLevel[level] = { scoredCount: byLevel[level].scoredCount - 1, hitCount: byLevel[level].hitCount - (history.outcome === "HIT" ? 1 : 0) };
  const scoredCount = summary.scoredCount - 1;
  const hitCount = summary.hitCount - (history.outcome === "HIT" ? 1 : 0);
  return { scoredCount, hitCount, hitRate: hitCount / scoredCount, byLevel };
}

function PredictionHistoryList({ items, scoreSummary, onRemove }) {
  return <section className="archive-card prediction-history"><div className="prediction-history-head"><h2>예측 이력</h2>{scoreSummary && <b>{scoreSummary.scoredCount}건 중 {scoreSummary.hitCount}건 적중 · {Math.round(scoreSummary.hitRate * 100)}%</b>}</div>{scoreSummary && <p className="prediction-score-note">등급 안내가 실제와 맞았는지를 표시하며, 확률값의 정확도와는 다릅니다.</p>}{items.length ? items.map((history) => <div className="prediction-history-row" key={history.id}><span>{history.stationName || history.queryCondition} · {history.requiredBikeCount ?? "-"}대 · {formatPredictionTargetAt(history.predictionTargetAt || history.queriedAt)}</span><span>{history.actualBikeCount == null ? outcomeLabel(history.outcome) : `실제 ${history.actualBikeCount}대`}</span><span className={`prediction-outcome ${history.outcome || "pending"}`}>{outcomeLabel(history.outcome)}</span><button type="button" className="archive-btn danger" onClick={() => onRemove(history.id)}>삭제</button></div>) : <p className="prediction-history-empty">예측 이력이 없습니다.</p>}</section>;
}

function formatPredictionTargetAt(value) {
  const targetAt = new Date(value);
  return value && !Number.isNaN(targetAt.getTime()) ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(targetAt) : "시각 확인 필요";
}

function outcomeLabel(outcome) {
  return ({ HIT: "적중", MISS: "빗나감", NOT_DUE: "아직 확인 전", UNVERIFIABLE: "확인 불가" })[outcome] || "아직 확인 전";
}

function ArchiveList({ title, items, empty, format, onRemove, onRestore }) {
  return <section className="archive-card archive-placeholder"><h2>{title}</h2>{items.length ? items.map((item) => <div className="summary-row" key={item.id}><span>{format(item)}</span><span>{item.replayable && <button type="button" className="archive-btn" onClick={() => onRestore(item)}>입력 복원</button>}<button type="button" className="archive-btn danger" onClick={() => onRemove(item.id)}>삭제</button></span></div>) : <p>{empty}</p>}</section>;
}
