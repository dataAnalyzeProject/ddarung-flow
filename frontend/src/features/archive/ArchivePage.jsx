import { useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { archiveSummaryFixture, savedStationsFixture } from "./data/archiveFixture";
import { BikePinIcon } from "./icons";
import "./ArchivePage.css";

const TABS = [
  { id: "stations", label: "저장 대여소" },
  { id: "routes", label: "저장 경로" },
  { id: "history", label: "예측 이력" },
];

export default function ArchivePage({ authState, user, onNavigate, onBeforeLogin, onLogout }) {
  const [tab, setTab] = useState("stations");
  const [stations, setStations] = useState(savedStationsFixture);

  const removeStation = (id) => {
    setStations((current) => current.filter((station) => station.id !== id));
  };

  const savedCount = stations.length + archiveSummaryFixture.savedRoutes + archiveSummaryFixture.predictionHistory;

  return (
    <div className="archive-shell">
      <AppHeader
        activeRoute="archive"
        authState={authState}
        user={user}
        onNavigate={onNavigate}
        onBeforeLogin={onBeforeLogin}
        onLogout={onLogout}
      />
      <main className="archive-content">
        <div className="archive-head">
          <div>
            <h1 className="archive-title">내 보관함</h1>
            <p className="archive-subtitle">저장한 대여소와 경로, 예측 이력을 한곳에서 확인하세요.</p>
          </div>
          <p className="archive-saved-count">
            저장 항목 <b>{savedCount}</b>개
          </p>
        </div>

        <div className="archive-tabs" role="tablist" aria-label="보관함 분류">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "stations" ? (
          <>
            <div className="archive-grid">
              {stations.map((station) => (
                <article className="archive-card station-card" key={station.id}>
                  <div className="station-top">
                    <div className="station-pin">
                      <BikePinIcon color={station.color} />
                    </div>
                    <div>
                      <span className="station-label">대여소</span>
                      <div className="station-name">{station.name}</div>
                      <div className="station-meta">{station.meta}</div>
                    </div>
                  </div>
                  <div className="station-stats">
                    <div>
                      <span className="stat-label">현재</span>
                      <span className="stat-value">{station.current}대</span>
                    </div>
                    <div>
                      <span className="stat-label">도착 시</span>
                      <span className="stat-value">{station.arrival}</span>
                    </div>
                    <div className="gauge" style={{ background: `conic-gradient(#0aa270 0 ${station.rate}%, #d9eee8 ${station.rate}% 100%)` }}>
                      <b>{station.rate}%</b>
                    </div>
                  </div>
                  <div className="station-actions">
                    <button type="button" className="archive-btn">상세보기</button>
                    <button type="button" className="archive-btn danger" onClick={() => removeStation(station.id)}>
                      삭제
                    </button>
                  </div>
                </article>
              ))}
              <aside className="archive-card summary-card">
                <h2>보관함 요약</h2>
                <div className="summary-row">
                  <span>저장 대여소</span>
                  <b style={{ color: "#08a36f" }}>{stations.length}</b>
                </div>
                <div className="summary-row">
                  <span>저장 경로</span>
                  <b style={{ color: "#0875ef" }}>{archiveSummaryFixture.savedRoutes}</b>
                </div>
                <div className="summary-row">
                  <span>예측 이력</span>
                  <b style={{ color: "#ff8700" }}>{archiveSummaryFixture.predictionHistory}</b>
                </div>
                <button type="button" className="archive-find-btn" onClick={() => onNavigate?.("main")}>
                  대여소 찾기
                </button>
              </aside>
            </div>
            <div className="archive-note">
              <span className="note-icon">i</span>
              <span>예측 이력은 요청 당시의 조건이며 현재 결과가 아닙니다.</span>
            </div>
          </>
        ) : (
          <div className="archive-card archive-placeholder">
            <h2>{tab === "routes" ? "저장 경로" : "예측 이력"} 준비 중</h2>
            <p>
              이 탭은 아직 실제 데이터 연동 전이라 임의로 화면을 확장하지 않았습니다.
              <br />
              실제 작업 계약이나 추가 시안이 확정되면 그 기준으로 채웁니다.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
