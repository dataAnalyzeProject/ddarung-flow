import { useEffect, useMemo, useState } from "react";
import "./MainPage.css";
import { serviceData, stations } from "./mainPageData";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";
import logo from "../../assets/main/ddaragayo-logo.png";
import routeMap from "../../assets/main/route-map.png";
import heroBike from "../../assets/main/hero-bike.png";
import RidingGuidePage from "../riding-guide/RidingGuidePage";

const EMPTY_INPUT = {
  origin: "",
  destination: "",
  travelMode: serviceData.selectedMode,
  directMinutes: 15,
};

const stationMeta = [
  { arrival: "11:05", range: "5~9대", rate: "87%", level: "매우 높음" },
  { arrival: "11:07", range: "2~5대", rate: "72%", level: "높음" },
  { arrival: "11:09", range: "0~2대", rate: "45%", level: "보통" },
];

export default function MainPage() {
  const [authState, setAuthState] = useState("anonymous");
  const [user, setUser] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [view, setView] = useState("idle");
  const [authNotice, setAuthNotice] = useState("");
  const [selectedStation, setSelectedStation] = useState(stations[0].id);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapType, setMapType] = useState("지도");
  const [guideStation, setGuideStation] = useState(null);
  const predictionVisible = true;

  useEffect(() => {
    const loginResult = new URLSearchParams(window.location.search).get("login");
    const pendingInput = loadPendingPrediction();

    if (loginResult === "failed") setAuthNotice("로그인에 실패했습니다. 다시 시도해 주세요.");
    if (loginResult === "cancelled") setAuthNotice("로그인이 취소되었습니다.");

    getCurrentUser()
      .then((auth) => {
        if (!auth.authenticated) {
          setAuthState("anonymous");
          return;
        }
        setUser(auth.user);
        setAuthState("authenticated");
        setView("result");
        if (loginResult === "success" && pendingInput) {
          setInput({ ...EMPTY_INPUT, ...pendingInput });
          setView("restored");
        }
      })
      .catch(() => {
        setAuthState("error");
      })
      .finally(() => {
        if (loginResult) window.history.replaceState({}, "", window.location.pathname);
      });
  }, []);

  const selectedStationName = useMemo(
    () => stations.find((station) => station.id === selectedStation)?.name,
    [selectedStation]
  );

  const updateInput = (key, value) => {
    setInput((current) => ({ ...current, [key]: value }));
    if (key === "directMinutes") setTimeConfirmed(false);
  };

  const handlePredict = () => {
    if (authState !== "authenticated") {
      savePendingPrediction(input);
      setLoginPromptOpen(true);
      return;
    }
    setView("result");
  };

  const saveInputBeforeLogin = () => savePendingPrediction(input);

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
      setView("idle");
      setAuthNotice("로그아웃되었습니다.");
    } catch {
      setAuthState("authenticated");
      setAuthNotice("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  if (guideStation) {
    return (
      <RidingGuidePage
        stationName={guideStation.name}
        onBack={() => setGuideStation(null)}
      />
    );
  }

  return (
    <main className="main-shell">
      <header className="main-header">
        <div className="main-brand">
          <img src={logo} alt="따라가요" />
          <span aria-hidden="true" />
          <strong>{serviceData.serviceName}</strong>
        </div>
        <nav aria-label="주요 메뉴" className="main-menu">
          <span aria-current="page">대여 예측</span>
          <span>Q&amp;A</span>
          <span>보관함</span>
          <span>알림</span>
        </nav>
        <div className="main-auth">
          {authState === "authenticated" || authState === "logging-out" ? (
            <><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{user ? `${user.displayName} · ${user.provider}` : ""}</span><button aria-label="로그아웃" type="button" disabled={authState === "logging-out"} onClick={handleLogout}>
              {authState === "logging-out" ? "로그아웃 중" : `${user?.displayName || "사용자"} · 로그아웃`}
            </button></>
          ) : authState === "loading" ? (
            <button type="button" disabled>확인 중</button>
          ) : (
            <a className="main-login-link" aria-label="로그인" href="/login" onClick={saveInputBeforeLogin}>{serviceData.loginButton}</a>
          )}
        </div>
      </header>

      <section className="main-search">
        <div className="main-hero-copy">
          <h1>도착할 때 빌릴 수 있는<br /><em>따릉이를 미리 확인</em>하세요.</h1>
          <p>예상 도착시간 기준 대여 가능 여부를 알려드립니다.</p>
        </div>
        <div className="main-fields">
          <label>
            <span>{serviceData.originLabel}</span>
            <span className="main-input-wrap"><input value={input.origin} onChange={(event) => updateInput("origin", event.target.value)} placeholder={serviceData.originPlaceholder} /><b aria-hidden="true" /></span>
          </label>
          <i aria-hidden="true">→</i>
          <label>
            <span>{serviceData.destinationLabel}</span>
            <span className="main-input-wrap"><input value={input.destination} onChange={(event) => updateInput("destination", event.target.value)} placeholder={serviceData.destinationPlaceholder} /><b aria-hidden="true" /></span>
          </label>
          <label className="main-time">
            <span>{serviceData.expectedTimeLabel}</span>
            <div><input aria-label={serviceData.expectedTimeLabel} type="number" min="1" value={input.directMinutes ?? ""} onChange={(event) => updateInput("directMinutes", event.target.value === "" ? null : Number(event.target.value))} /><small>분 단위</small><button type="button" onClick={() => setTimeConfirmed(true)}>시간 확인</button></div>
          </label>
        </div>
        <div className="main-actions">
          <span>이동 수단</span>
          <div className="main-mode-buttons">
            {serviceData.modes.map((mode) => (
              <button className={mode === input.travelMode ? "active" : ""} key={mode} type="button" onClick={() => updateInput("travelMode", mode)}>
                <b className={mode === "도보" ? "walk-icon" : "transit-icon"} aria-hidden="true" />{mode}
              </button>
            ))}
          </div>
          <img className="main-hero-bike" src={heroBike} alt="" />
          <button aria-label={serviceData.predictButton} className="main-submit" type="button" onClick={handlePredict}><span aria-hidden="true" />{serviceData.predictButton}</button>
        </div>
      </section>

      {timeConfirmed && <p className="main-time-notice">예상시간을 <strong>{input.directMinutes || "이동수단 기준"}{input.directMinutes ? "분" : ""}</strong>으로 확인했습니다.</p>}
      {authNotice && <section className="main-feedback error"><b>로그인 안내</b><p>{authNotice}</p><button type="button" onClick={() => setAuthNotice("")}>닫기</button></section>}
      {view === "restored" && <section className="main-feedback restored"><b>입력값을 불러왔습니다</b><p>이전 입력값을 확인한 뒤 다시 예측해 주세요.</p><button type="button" onClick={handlePredict}>{serviceData.retryButton}</button></section>}

      <section className="main-dashboard">
        {predictionVisible && <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}><b>{serviceData.resultTitle}</b><i>화면 확인용 예시 결과 · 대여소 3곳</i></span>}
        <section className="main-station-panel">
          <header className="main-section-head"><h2>추천 대여소</h2><span>마지막 업데이트 10:32</span><select aria-label="대여소 정렬"><option>예상 도착시간 기준</option></select></header>
          <div className="main-station-list">
            {stations.map((station, index) => {
              const selected = selectedStation === station.id;
              const meta = stationMeta[index];
              return (
                <div aria-label={`${station.name} 대여소 카드`} className={`main-station ${selected ? "selected" : ""}`} key={station.id} role="group">
                  <button
                    aria-label={`${station.name} 대여소 선택`}
                    aria-pressed={selected}
                    className="main-station-select"
                    type="button"
                    onClick={() => setSelectedStation(station.id)}
                  />
                  <b className="main-rank">{index + 1}</b>
                  <span className="main-station-name"><h3 style={{ margin: 0, fontSize: 15 }}>{station.name}</h3>{index === 0 && <em>추천</em>}<small>{station.distance} · 도보 {2 + index * 2}분</small></span>
                  <span className="main-station-stat"><small>현재 자전거</small><strong>{station.bikes}<i>대</i></strong></span>
                  <span className="main-station-stat"><small>예상 도착 시({meta.arrival})</small><strong>{predictionVisible ? meta.range : "--"}</strong></span>
                  <span className="main-station-rate"><small>예상 대여 성공률</small><b aria-label={`성공률 ${predictionVisible ? meta.rate : "미확인"}`}>{predictionVisible ? `${meta.rate.slice(0, -1)} %` : "--"}</b><em>{predictionVisible ? meta.level : "로그인 후 확인"}</em></span>
                  <button
                    aria-label={`${station.name} 상세보기`}
                    className="main-details"
                    type="button"
                    onClick={() => {
                      setSelectedStation(station.id);
                      setGuideStation(station);
                    }}
                  >
                    상세보기
                  </button>
                </div>
              );
            })}
          </div>
          <button className="main-more" type="button">더 많은 대여소 보기⌄</button>
        </section>

        <section className="main-map-panel" aria-label={serviceData.mapLabel}>
          <header className="main-section-head"><h2>경로 및 추천 대여소 지도</h2><span>현재 자전거 수　<b className="green">●</b> 많음　<b className="yellow">●</b> 보통　<b className="red">●</b> 적음</span></header>
          <div className="main-map">
            <img className={mapType === "위성" ? "satellite" : ""} style={{ transform: `scale(${mapZoom})` }} src={routeMap} alt="천호동 이동 경로와 추천 대여소 지도" />
            <div className="main-map-tabs">{["지도", "위성"].map((type) => <button className={mapType === type ? "active" : ""} type="button" aria-pressed={mapType === type} key={type} onClick={() => setMapType(type)}>{type}</button>)}</div>
            <button className="main-redraw" type="button" onClick={() => setLocationChecked(true)}>⊙ 경로 다시 그리기</button>
            {locationChecked && <span className="main-my-location">현 위치</span>}
            <div className="main-zoom"><button type="button" aria-label="지도 확대" onClick={() => setMapZoom((zoom) => Math.min(1.35, Number((zoom + .1).toFixed(2))))}>＋</button><button type="button" aria-label="지도 축소" onClick={() => setMapZoom((zoom) => Math.max(.8, Number((zoom - .1).toFixed(2))))}>−</button></div>
            <button className="main-expand" type="button" onClick={() => setMapExpanded(true)}>지도 크게 보기</button>
          </div>
        </section>

        <aside className="main-side-panels">
          <section><header><h2>예상 대여 성공률</h2><i className="main-info" aria-label="도움말" /></header><div className="main-success"><strong>{predictionVisible ? "87%" : "--"}</strong><p><b>매우 높음</b><span>{selectedStationName || "성수역 3번 출구"} 기준</span><em>도착 시 대여 가능성이 매우 높아요!</em></p></div></section>
          <section><header><h2>도착 시간대 혼잡도</h2></header><div className="main-chart"><span>혼잡</span>{[34,25,49,39,22].map((height,index)=><i className={index===2?"current":""} style={{height}} key={index}><b>{9+index}시</b></i>)}</div></section>
          <section><header><h2>날씨 &amp; 추천 이동 팁</h2><i className="main-info" aria-label="도움말" /></header><div className="main-weather"><b aria-label="맑음" /><strong>24°C<small>맑음</small></strong><dl><div><dt>강수확률</dt><dd>10%</dd></div><div><dt>미세먼지</dt><dd>보통</dd></div><div><dt>바람</dt><dd>약 2m/s</dd></div></dl></div><p className="main-tip">날씨가 좋아 자전거 이용하기 좋은 날씨예요!</p></section>
        </aside>
      </section>

      {mapExpanded && <section className="main-map-modal" role="dialog" aria-modal="true" aria-label="확대된 예측 지도"><header><h2>경로 및 추천 대여소 지도</h2><button type="button" onClick={() => setMapExpanded(false)}>닫기</button></header><img src={routeMap} alt="확대된 천호동 이동 경로 지도" /></section>}
      {loginPromptOpen && <section className="main-login-modal" role="dialog" aria-modal="true" aria-label="로그인 필요 안내"><span aria-hidden="true">!</span><h2>로그인이 필요합니다</h2><p>{serviceData.loginNotice}</p><div><button type="button" onClick={() => setLoginPromptOpen(false)}>닫기</button><a className="primary" href="/login" onClick={saveInputBeforeLogin}>로그인하기</a></div></section>}
    </main>
  );
}
