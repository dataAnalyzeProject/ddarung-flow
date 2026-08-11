import { useEffect, useState } from "react";
import "../main-screen-drafts/drafts/Draft6CardCanvas.css";
import { mapRoads, serviceData, stations } from "../main-screen-drafts/data/mockData";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";

const EMPTY_INPUT = {
  origin: "",
  destination: "",
  travelMode: serviceData.selectedMode,
  directMinutes: null,
};

export default function MainPage() {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [view, setView] = useState("idle");
  const [authNotice, setAuthNotice] = useState("");
  const [selectedStation, setSelectedStation] = useState(stations[0].id);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const predictionVisible = view === "result";

  useEffect(() => {
    const loginResult = new URLSearchParams(window.location.search).get("login");
    const pendingInput = loadPendingPrediction();

    if (loginResult === "failed") {
      setAuthNotice("로그인에 실패했습니다. 다시 시도해 주세요.");
    } else if (loginResult === "cancelled") {
      setAuthNotice("로그인이 취소되었습니다.");
    }

    getCurrentUser()
      .then((auth) => {
        if (!auth.authenticated) {
          setAuthState("anonymous");
          return;
        }

        setUser(auth.user);
        setAuthState("authenticated");
        if (loginResult === "success" && pendingInput) {
          setInput({ ...EMPTY_INPUT, ...pendingInput });
          setView("restored");
        }
      })
      .catch(() => {
        setAuthState("error");
        setAuthNotice("로그인 상태를 확인하지 못했습니다.");
      })
      .finally(() => {
        if (loginResult) {
          window.history.replaceState({}, "", window.location.pathname);
        }
      });
  }, []);

  const updateInput = (key, value) => {
    setInput((current) => ({ ...current, [key]: value }));
    if (key === "directMinutes") {
      setTimeConfirmed(false);
    }
  };

  const handlePredict = () => {
    if (authState !== "authenticated") {
      savePendingPrediction(input);
      setLoginPromptOpen(true);
      return;
    }
    setView("result");
  };

  const saveInputBeforeLogin = () => {
    savePendingPrediction(input);
  };

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
      setView("idle");
      setAuthNotice("로그아웃되었습니다.");
    } catch (error) {
      setAuthState("authenticated");
      setAuthNotice("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <main className="draft6-shell">
      <header className="draft6-header">
        <div className="draft6-brand"><span>SEOUL BIKE</span><strong>{serviceData.serviceName}</strong></div>
        <div className="draft6-status">● {user ? `${user.displayName} · ${user.provider}` : serviceData.resultSummary}</div>
        {authState === "authenticated" || authState === "logging-out" ? (
          <button type="button" disabled={authState === "logging-out"} onClick={handleLogout}>{authState === "logging-out" ? "로그아웃 중" : "로그아웃"}</button>
        ) : (
          authState === "loading" ? <button type="button" disabled>확인 중</button> : <a href="/login" onClick={saveInputBeforeLogin}>{serviceData.loginButton}</a>
        )}
      </header>

      <section className="draft6-search">
        <div><p>{serviceData.eyebrow}</p><h1>{serviceData.description}</h1></div>
        <div className="draft6-fields">
          <label><span>{serviceData.originLabel}</span><input value={input.origin} onChange={(event) => updateInput("origin", event.target.value)} placeholder={serviceData.originPlaceholder} /></label>
          <i>→</i>
          <label><span>{serviceData.destinationLabel}</span><input value={input.destination} onChange={(event) => updateInput("destination", event.target.value)} placeholder={serviceData.destinationPlaceholder} /></label>
          <label className="draft6-time"><span>{serviceData.expectedTimeLabel}</span><div><input aria-label={serviceData.expectedTimeLabel} type="number" min="1" value={input.directMinutes ?? ""} onChange={(event) => updateInput("directMinutes", event.target.value === "" ? null : Number(event.target.value))} placeholder="분 단위" /><button type="button" onClick={() => setTimeConfirmed(true)}>시간 확인</button></div></label>
        </div>
        <div className="draft6-actions">
          {serviceData.modes.map((mode) => <button className={mode === input.travelMode ? "active" : ""} key={mode} type="button" onClick={() => updateInput("travelMode", mode)}>{mode}</button>)}
          <button className="draft6-submit" type="button" onClick={handlePredict}>{serviceData.predictButton}</button>
        </div>
      </section>

      {timeConfirmed && <p className="draft6-time-notice">예상시간을 <strong>{input.directMinutes || "이동수단 기준"}{input.directMinutes ? "분" : ""}</strong>으로 확인했습니다.</p>}
      {authNotice && <section className="draft6-feedback error"><b>로그인 안내</b><p>{authNotice}</p><button type="button" onClick={() => setAuthNotice("")}>닫기</button></section>}
      {view === "restored" && <section className="draft6-feedback restored"><b>입력값을 불러왔습니다</b><p>이전 입력값을 확인한 뒤 직접 다시 예측해 주세요.</p><button type="button" onClick={handlePredict}>{serviceData.retryButton}</button></section>}

      <section className="draft6-results">
        <div className="draft6-title"><div><p>{predictionVisible ? "예측 완료" : "주변 대여소"}</p><h2>{serviceData.resultTitle}</h2></div><span>{predictionVisible ? "화면 확인용 예시 결과 · 대여소 3곳" : "화면 확인용 기본 UI · 예측은 로그인 후 확인"}</span></div>
        <div className="draft6-card-grid">
          {stations.map((station, index) => {
            const selected = selectedStation === station.id;
            return <button className={`draft6-card card-${index + 1} ${selected ? "selected" : ""}`} key={station.id} type="button" onClick={() => setSelectedStation(selected ? null : station.id)} aria-pressed={selected}>
              <header><span>{predictionVisible ? station.role : "주변 대여소"}</span><strong>{predictionVisible ? station.probability : "--"}</strong></header>
              <h3>{station.name}</h3><p>{station.distance}</p>
              <div className="draft6-bike"><b>{station.bikes}</b><span>현재 자전거<br />대</span></div>
              <dl><div><dt>예상 도착시간</dt><dd>{predictionVisible ? station.arrivalTime : "--"}</dd></div><div><dt>대여 가능성</dt><dd>{predictionVisible ? station.availability : "로그인 후 확인"}</dd></div></dl>
              <em>{selected ? "상세정보 닫기 ↑" : "상세정보 펼치기 ↓"}</em>
            </button>;
          })}
          <div className="draft6-map" aria-label={serviceData.mapLabel}>
            <div className="draft6-map-tools"><strong>{serviceData.mapLabel}</strong><button type="button" onClick={() => setLocationChecked(true)}>내 위치 확인</button><button type="button" onClick={() => setMapExpanded(true)}>지도 확대</button></div><div className="draft6-map-grid" />
            {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
            {stations.map((station, index) => <span className={`draft6-dot dot-${index + 1} ${selectedStation === station.id ? "selected" : ""}`} key={station.id}>{index + 1}</span>)}
            {locationChecked && <span className="draft6-my-location">내 위치</span>}
          </div>
        </div>
        {selectedStation && <aside className="draft6-detail"><div><span>선택한 대여소</span><strong>{stations.find((station) => station.id === selectedStation)?.name}</strong></div><p>{predictionVisible ? "예상 도착시간과 현재 자전거 수를 확인한 뒤 대여소를 선택할 수 있습니다." : "현재 자전거 수와 위치를 확인할 수 있습니다. 대여 가능성 예측은 로그인 후 제공됩니다."}</p><button type="button" onClick={() => setSelectedStation(null)}>상세정보 닫기</button></aside>}
        {locationChecked && <p className="draft6-location-notice">현재 위치를 확인했습니다. 지도에서 주변 대여소와의 거리를 비교할 수 있습니다. · 화면 확인용 예시 상태</p>}
      </section>

      {mapExpanded && <section className="draft6-map-modal" role="dialog" aria-modal="true" aria-label="확대된 예측 지도"><header><div><span>확대 지도</span><h2>내 위치와 목적지 주변 대여소</h2></div><button type="button" onClick={() => setMapExpanded(false)}>지도 닫기 ×</button></header><div className="draft6-large-map"><div className="draft6-map-grid" />{mapRoads.map((road) => <span key={road.id} className={road.className} />)}{stations.map((station, index) => <span className={`draft6-dot dot-${index + 1}`} key={station.id}>{index + 1}</span>)}{locationChecked && <span className="draft6-my-location">내 위치</span>}</div><footer><p>실제 위치·지도 API를 연결하지 않은 화면 확인용 예시입니다.</p><button type="button" onClick={() => setLocationChecked(true)}>내 위치 확인</button></footer></section>}

      {loginPromptOpen && <section className="draft6-login-modal" role="dialog" aria-modal="true" aria-label="로그인 필요 안내"><span aria-hidden="true">!</span><h2>로그인이 필요합니다</h2><p>{serviceData.loginNotice}</p><div><button type="button" onClick={() => setLoginPromptOpen(false)}>닫기</button><a className="primary" href="/login" onClick={saveInputBeforeLogin}>로그인하기</a></div></section>}
    </main>
  );
}
