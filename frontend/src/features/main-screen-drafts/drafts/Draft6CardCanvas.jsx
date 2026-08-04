import { useState } from "react";
import "./Draft6CardCanvas.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

const STATES = [
  ["login", "로그인 필요"],
  ["restored", "로그인 후"],
  ["result", "예측 결과"],
  ["empty", "결과 없음"],
  ["error", "오류"],
];

export function Draft6CardCanvas() {
  const [view, setView] = useState("result");
  const [selectedStation, setSelectedStation] = useState(stations[0].id);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [expectedTime, setExpectedTime] = useState(serviceData.expectedTimeValue);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const loggedIn = view !== "login";

  const showResult = view === "result";
  const notice = view === "empty" ? serviceData.noResultNotice : serviceData.errorNotice;

  return (
    <main className="draft6-shell">
      <header className="draft6-header">
        <div className="draft6-brand"><span>SEOUL BIKE</span><strong>{serviceData.serviceName}</strong></div>
        <div className="draft6-status">● {serviceData.resultSummary}</div>
        <button type="button" onClick={() => setView(loggedIn ? "login" : "restored")}>{loggedIn ? "로그아웃" : serviceData.loginButton}</button>
      </header>

      <nav className="draft6-state-nav" aria-label="화면 상태 미리보기">
        <strong>화면 상태</strong>
        {STATES.map(([key, label]) => <button className={view === key ? "active" : ""} key={key} type="button" onClick={() => setView(key)}>{label}</button>)}
      </nav>

      <section className="draft6-search">
        <div><p>{serviceData.eyebrow}</p><h1>{serviceData.description}</h1></div>
        <div className="draft6-fields">
          <label><span>{serviceData.originLabel}</span><input defaultValue={loggedIn ? "서울숲" : ""} placeholder={serviceData.originPlaceholder} /></label>
          <i>→</i>
          <label><span>{serviceData.destinationLabel}</span><input defaultValue={loggedIn ? "성수역" : ""} placeholder={serviceData.destinationPlaceholder} /></label>
          <label className="draft6-time"><span>{serviceData.expectedTimeLabel}</span><div><input aria-label={serviceData.expectedTimeLabel} value={expectedTime} onChange={(event) => { setExpectedTime(event.target.value); setTimeConfirmed(false); }} /><button type="button" onClick={() => setTimeConfirmed(true)}>시간 확인</button></div></label>
        </div>
        <div className="draft6-actions">
          {serviceData.modes.map((mode) => <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">{mode}</button>)}
          <button className="draft6-submit" type="button" onClick={() => loggedIn ? setView("result") : setLoginPromptOpen(true)}>{loggedIn ? serviceData.retryButton : serviceData.predictButton}</button>
        </div>
      </section>
      {timeConfirmed && <p className="draft6-time-notice">예상시간을 <strong>{expectedTime}</strong>으로 확인했습니다. 이 시간을 기준으로 대여 가능성을 비교합니다.</p>}

      {view === "login" && <section className="draft6-feedback login"><b>로그인이 필요합니다</b><p>{serviceData.loginNotice}</p><button type="button" onClick={() => setView("restored")}>{serviceData.loginButton}</button></section>}
      {view === "restored" && <section className="draft6-feedback restored"><b>입력값을 불러왔습니다</b><p>이전 입력값을 확인한 뒤 직접 다시 예측해 주세요.</p><button type="button" onClick={() => setView("result")}>{serviceData.retryButton}</button></section>}
      {(view === "empty" || view === "error") && <section className={`draft6-feedback ${view}`}><b>{view === "empty" ? "검색 결과가 없습니다" : "일시적인 오류가 발생했습니다"}</b><p>{notice}</p><button type="button" onClick={() => setView("restored")}>{view === "empty" ? "입력 수정" : "다시 시도"}</button></section>}

      {showResult && <section className="draft6-results">
        <div className="draft6-title"><div><p>예측 완료</p><h2>{serviceData.resultTitle}</h2></div><span>카드를 선택해 상세정보를 확인하세요 · 대여소 3곳</span></div>
        <div className="draft6-card-grid">
          {stations.map((station, index) => {
            const selected = selectedStation === station.id;
            return <button className={`draft6-card card-${index + 1} ${selected ? "selected" : ""}`} key={station.id} type="button" onClick={() => setSelectedStation(selected ? null : station.id)} aria-pressed={selected}>
              <header><span>{station.role}</span><strong>{station.probability}</strong></header>
              <h3>{station.name}</h3><p>{station.distance}</p>
              <div className="draft6-bike"><b>{station.bikes}</b><span>현재 자전거<br />대</span></div>
              <dl><div><dt>예상 도착시간</dt><dd>{station.arrivalTime}</dd></div><div><dt>대여 가능성</dt><dd>{station.availability}</dd></div></dl>
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
        {selectedStation && <aside className="draft6-detail">
          <div><span>선택한 대여소</span><strong>{stations.find((station) => station.id === selectedStation)?.name}</strong></div>
          <p>예상 도착시간과 현재 자전거 수를 확인한 뒤 대여소를 선택할 수 있습니다.</p>
          <button type="button" onClick={() => setSelectedStation(null)}>상세정보 닫기</button>
        </aside>}
        {locationChecked && <p className="draft6-location-notice">현재 위치를 확인했습니다. 지도에서 주변 대여소와의 거리를 비교할 수 있습니다. · 화면 확인용 예시 상태</p>}
      </section>}

      {mapExpanded && <section className="draft6-map-modal" role="dialog" aria-modal="true" aria-label="확대된 예측 지도">
        <header><div><span>확대 지도</span><h2>내 위치와 목적지 주변 대여소</h2></div><button type="button" onClick={() => setMapExpanded(false)}>지도 닫기 ×</button></header>
        <div className="draft6-large-map"><div className="draft6-map-grid" />{mapRoads.map((road) => <span key={road.id} className={road.className} />)}{stations.map((station, index) => <span className={`draft6-dot dot-${index + 1}`} key={station.id}>{index + 1}</span>)}{locationChecked && <span className="draft6-my-location">내 위치</span>}</div>
        <footer><p>실제 위치·지도 API를 연결하지 않은 화면 확인용 예시입니다.</p><button type="button" onClick={() => setLocationChecked(true)}>내 위치 확인</button></footer>
      </section>}

      {loginPromptOpen && <section className="draft6-login-modal" role="dialog" aria-modal="true" aria-label="로그인 필요 안내">
        <span aria-hidden="true">!</span>
        <h2>로그인이 필요합니다</h2>
        <p>{serviceData.loginNotice}</p>
        <div><button type="button" onClick={() => setLoginPromptOpen(false)}>닫기</button><button className="primary" type="button" onClick={() => { setLoginPromptOpen(false); setView("restored"); }}>로그인하기</button></div>
      </section>}
    </main>
  );
}

export default Draft6CardCanvas;
