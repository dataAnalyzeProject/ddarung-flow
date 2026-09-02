import { useEffect, useState } from "react";
import { consumerPersonalAdapter } from "../adapters/personal/consumerPersonalAdapter";
import { ConsumerAppHeader, ConsumerButton, ConsumerContainer, ConsumerIcon, ConsumerR2Theme, StatusBadge } from "../shared";
import currentLandscape from "../../../assets/consumer-r2/personal/cr22-archive-current-landscape-v1.webp";
import "./personal.css";

function journeyLabel(savedJourney) {
  const input = savedJourney.replayInput || {};
  return savedJourney.displayName || [input.origin?.displayName, input.destination?.displayName].filter(Boolean).join(" → ") || "저장한 AI 계획";
}

export default function PersonalArchivePage({ adapter = consumerPersonalAdapter, authState = "authenticated", onNavigate, onReplay, user }) {
  const [state, setState] = useState("loading");
  const [archive, setArchive] = useState({ favorites: [], savedJourneys: [] });
  const [recentSearches, setRecentSearches] = useState([]);
  const [replayingId, setReplayingId] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("favorites");

  useEffect(() => {
    if (authState !== "authenticated") {
      setState("auth-required");
      return undefined;
    }
    let cancelled = false;
    setState("loading");
    Promise.all([adapter.loadArchive(), Promise.resolve(adapter.readRecentSearches(user))])
      .then(([nextArchive, nextRecentSearches]) => {
        if (!cancelled) {
          setArchive(nextArchive);
          setRecentSearches(nextRecentSearches);
          setState("ready");
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.status === 401 ? "auth-required" : "archive-error");
          setState("error");
        }
      });
    return () => { cancelled = true; };
  }, [adapter, authState, user]);

  async function replay(savedJourneyId) {
    setReplayingId(savedJourneyId);
    setError("");
    try {
      const decision = await adapter.replaySavedJourney(savedJourneyId);
      onReplay?.(decision);
    } catch (requestError) {
      setError(requestError.code === "PREMIUM_REQUIRED" ? "premium-required" : "replay-error");
    } finally {
      setReplayingId("");
    }
  }

  function moveTab(event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['favorites', 'plans', 'recent'];
    const currentIndex = tabs.indexOf(activeTab);
    const nextTab = tabs[(currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setActiveTab(nextTab);
    document.getElementById(`archive-tab-${nextTab}`)?.focus();
  }

  return (
    <ConsumerR2Theme className="cr22-personal">
      <ConsumerAppHeader activeItem="archive" authState={authState} onAccount={() => onNavigate?.("mypage")} onLogin={() => onNavigate?.("login")} onNavigate={onNavigate} userName={user?.displayName || user?.name} userTier={user?.tier} />
      <main className="cr22-personal__main" id="main-content">
        <ConsumerContainer>
          <header className="cr22-personal__hero"><div><h1>보관함</h1><p>다시 쓰고 싶은 조건을 모아두세요. 즐겨찾기와 저장한 계획은 열 때마다 현재 정보로 확인합니다.</p></div><StatusBadge tone="info">현재 정보 기준</StatusBadge></header>
          {state === "loading" ? <p className="cr22-personal__state" role="status">보관함을 불러오는 중입니다…</p> : null}
          {state === "auth-required" || error === "auth-required" ? <section className="cr22-personal__state" role="alert"><h2>로그인이 필요합니다</h2><ConsumerButton onClick={() => onNavigate?.("login")}>로그인하기</ConsumerButton></section> : null}
          {state === "error" && error !== "auth-required" ? <section className="cr22-personal__state cr22-personal__state--error" role="alert"><h2>보관함을 불러오지 못했습니다</h2><p>현재 저장 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.</p></section> : null}
          {state === "ready" ? <section className="cr22-personal__archive" aria-label="개인 보관함"><div className="cr22-personal__tabs" role="tablist" aria-label="보관함 분류"><button id="archive-tab-favorites" aria-controls={activeTab === "favorites" ? "archive-panel-favorites" : undefined} type="button" role="tab" aria-selected={activeTab === "favorites"} onClick={() => setActiveTab("favorites")} onKeyDown={moveTab}>즐겨찾는 대여소 <span>{archive.favorites.length}</span></button><button id="archive-tab-plans" aria-controls={activeTab === "plans" ? "archive-panel-plans" : undefined} type="button" role="tab" aria-selected={activeTab === "plans"} onClick={() => setActiveTab("plans")} onKeyDown={moveTab}>저장한 AI 계획 <span>{archive.savedJourneys.length}</span></button><button id="archive-tab-recent" aria-controls={activeTab === "recent" ? "archive-panel-recent" : undefined} type="button" role="tab" aria-selected={activeTab === "recent"} onClick={() => setActiveTab("recent")} onKeyDown={moveTab}>최근 검색 <span>{recentSearches.length}</span></button></div>
            {activeTab === "favorites" ? <section className="cr22-personal__panel" id="archive-panel-favorites" role="tabpanel" aria-labelledby="archive-tab-favorites"><div className="cr22-personal__section-head"><div><h2 id="favorites-title">즐겨찾는 대여소</h2><p>저장한 대여소는 열 때마다 현재 정보를 다시 조회해요.</p></div><StatusBadge tone="info">현재 정보</StatusBadge></div><aside className="cr22-personal__current-banner"><ConsumerIcon name="info" size={20} /><p>재고와 운영 상태는 저장 당시 값이 아니라, 대여소를 열 때 새로 확인합니다.</p><img src={currentLandscape} alt="" width="1200" height="626" /></aside>{archive.favorites.length ? <div className="cr22-personal__favorite-grid">{archive.favorites.map((favorite) => <article className="cr22-personal__favorite-card" key={favorite.id}><span className="cr22-personal__favorite-mark"><ConsumerIcon name="check" size={16} /></span><h3>{favorite.stationName || "저장한 대여소"}</h3><p className="cr22-personal__location"><ConsumerIcon name="mapPin" size={15} /> 저장한 대여소</p><p>{favorite.currentStationId ? "현재 재고·수집 상태는 상세 화면에서 확인합니다." : "현재 상세 정보를 연결하지 못했습니다."}</p><div><ConsumerButton block disabled={!favorite.currentStationId} size="sm" onClick={() => onNavigate?.("station", favorite.currentStationId)}>현재 정보 보기</ConsumerButton><ConsumerButton block variant="secondary" size="sm" disabled>삭제</ConsumerButton></div></article>)}</div> : <p className="cr22-personal__empty">즐겨찾는 대여소가 없습니다. 대여소 상세에서 저장해 보세요.</p>}<p className="cr22-personal__bottom-note">대여소를 열면 최신 정보로 다시 확인합니다.</p></section> : null}
            {activeTab === "plans" ? <section className="cr22-personal__panel" id="archive-panel-plans" role="tabpanel" aria-labelledby="archive-tab-plans"><div className="cr22-personal__section-head"><div><h2 id="plans-title">저장한 AI 계획</h2><p>저장한 조건을 바탕으로 현재 대여·교통·환경 정보를 다시 수집합니다.</p></div><div className="cr22-personal__panel-actions"><StatusBadge tone="premium">PREMIUM</StatusBadge><button className="cr22-personal__sort" type="button" aria-label="최신 저장순 정렬">최신 저장순 <ConsumerIcon name="chevronDown" size={15} /></button></div></div><aside className="cr22-personal__current-banner"><ConsumerIcon name="info" size={20} /><p>과거 확률이나 경로를 다시 보여주지 않고, 현재 정보로 새 계획을 만듭니다.</p><img src={currentLandscape} alt="" width="1200" height="626" /></aside>{archive.savedJourneys.length ? <div className="cr22-personal__list">{archive.savedJourneys.map((savedJourney) => <article className="cr22-personal__row cr22-personal__row--plan" key={savedJourney.savedJourneyId}><span className="cr22-personal__plan-thumb" aria-hidden="true"><ConsumerIcon name="plan" size={22} /></span><div><h3>{journeyLabel(savedJourney)}</h3><p>{savedJourney.replayInput?.origin?.displayName || "출발지"} → {savedJourney.replayInput?.destination?.displayName || "목적지"}</p></div><div className="cr22-personal__conditions"><strong>저장한 조건</strong><span>자전거 {savedJourney.replayInput?.requiredBikeCount || "-"}대 · {savedJourney.replayInput?.maxJourneyMinutes || "-"}분 이내</span></div><ConsumerButton loading={replayingId === savedJourney.savedJourneyId} loadingLabel="현재 정보 확인 중…" variant="premium" size="sm" onClick={() => replay(savedJourney.savedJourneyId)}>현재 정보로 다시 계획</ConsumerButton></article>)}</div> : <p className="cr22-personal__empty">저장한 AI 계획이 없습니다. AI 플래너에서 조건을 저장해 보세요.</p>}{error === "premium-required" ? <p className="cr22-personal__notice" role="alert">현재 정보로 다시 계획은 Premium 활성 계정에서만 실행할 수 있습니다.</p> : null}{error === "replay-error" ? <p className="cr22-personal__notice" role="alert">현재 정보를 다시 계획하지 못했습니다. 저장 당시의 결과는 표시하지 않습니다.</p> : null}<div className="cr22-personal__planner-cta"><div><strong>나에게 맞는 새 라이딩을 계획해 보세요</strong><span>AI 플래너에서 조건을 새로 정할 수 있습니다.</span></div><ConsumerButton variant="secondary" size="sm" onClick={() => onNavigate?.("planner")}>AI 플래너로 이동</ConsumerButton></div></section> : null}
            {activeTab === "recent" ? <section className="cr22-personal__panel" id="archive-panel-recent" role="tabpanel" aria-labelledby="archive-tab-recent"><div className="cr22-personal__section-head"><div><h2 id="recent-title">최근 검색</h2><p>이 계정의 입력 조건만 최대 5개까지 저장합니다.</p></div><StatusBadge>입력 조건</StatusBadge></div>{recentSearches.length ? <div className="cr22-personal__list">{recentSearches.map((search) => <article className="cr22-personal__row" key={`${search.origin.providerId}-${search.destination.providerId}-${search.travelMode}-${search.requiredBikeCount}`}><div><h3>{search.origin.displayName} → {search.destination.displayName}</h3><p>{search.travelMode === "PUBLIC_TRANSIT" ? "대중교통" : "도보"} · 자전거 {search.requiredBikeCount}대</p></div><ConsumerButton variant="secondary" size="sm" onClick={() => onNavigate?.("main", { restoreSearch: search })}>같은 조건으로 다시 비교</ConsumerButton></article>)}</div> : <p className="cr22-personal__empty">최근 검색이 없습니다. 비교한 조건이 최대 5개까지 이 계정에만 저장됩니다.</p>}</section> : null}
          </section> : null}
        </ConsumerContainer>
      </main>
    </ConsumerR2Theme>
  );
}
