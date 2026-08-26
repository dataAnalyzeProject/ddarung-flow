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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadArchive()
      .then(([favorites, savedRoutes, predictionHistories]) => {
        setStations(favorites);
        setRoutes(savedRoutes);
        setHistories(predictionHistories);
      })
      .catch((requestError) => setError(requestError.code || "보관함을 불러오지 못했습니다."))
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
        await removePredictionHistory(id);
        setHistories((current) => current.filter((item) => item.id !== id));
      }
    } catch (requestError) {
      setError(requestError.code || "삭제하지 못했습니다.");
    }
  };

  const savedCount = stations.length + routes.length + histories.length;

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
        {error && <p role="alert" className="archive-note">{error}</p>}
        {!loading && tab === "stations" && <div className="archive-grid">
          {stations.map((station) => <article className="archive-card station-card" key={station.id}>
            <div className="station-top"><div className="station-pin"><BikePinIcon color="#08a36f" /></div><div><span className="station-label">대여소</span><div className="station-name">{station.stationName || `대여소 ${station.stationId}`}</div><div className="station-meta">대여소 ID {station.stationId}</div></div></div>
            <div className="station-actions"><button type="button" className="archive-btn" onClick={() => onNavigate?.("main")}>상세보기</button><button type="button" className="archive-btn danger" onClick={() => remove("station", station.id)}>삭제</button></div>
          </article>)}
          {!stations.length && <section className="archive-card archive-placeholder"><h2>저장한 대여소가 없습니다.</h2><p>지도에서 대여소를 저장하면 이곳에서 확인할 수 있습니다.</p></section>}
          <aside className="archive-card summary-card"><h2>보관함 요약</h2><div className="summary-row"><span>저장 대여소</span><b style={{ color: "#08a36f" }}>{stations.length}</b></div><div className="summary-row"><span>저장 경로</span><b style={{ color: "#0875ef" }}>{routes.length}</b></div><div className="summary-row"><span>예측 이력</span><b style={{ color: "#ff8700" }}>{histories.length}</b></div><button type="button" className="archive-find-btn" onClick={() => onNavigate?.("main")}>대여소 찾기</button></aside>
        </div>}
        {!loading && tab === "routes" && <ArchiveList title="저장 경로" items={routes} empty="저장한 경로가 없습니다." format={(route) => `${route.startStationName || route.startStationId} → ${route.endStationName || route.endStationId}`} onRemove={(id) => remove("route", id)} />}
        {!loading && tab === "history" && <ArchiveList title="예측 이력" items={histories} empty="예측 이력이 없습니다." format={(history) => `${history.queryCondition} · ${history.summaryResult}`} onRemove={(id) => remove("history", id)} />}
        <div className="archive-note"><span className="note-icon">i</span><span>예측 이력은 요청 당시의 조건이며 현재 결과가 아닙니다.</span></div>
      </main>
    </div>
  );
}

function ArchiveList({ title, items, empty, format, onRemove }) {
  return <section className="archive-card archive-placeholder"><h2>{title}</h2>{items.length ? items.map((item) => <div className="summary-row" key={item.id}><span>{format(item)}</span><button type="button" className="archive-btn danger" onClick={() => onRemove(item.id)}>삭제</button></div>) : <p>{empty}</p>}</section>;
}
