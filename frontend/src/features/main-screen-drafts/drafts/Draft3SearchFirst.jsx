import "./Draft3SearchFirst.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

export function Draft3SearchFirst() {
  return (
    <main className="draft3-shell">
      <header className="draft3-header">
        <a href="#draft3-main" className="draft3-brand">
          <span aria-hidden="true">T</span>
          {serviceData.serviceName}
        </a>
        <button type="button">{serviceData.loginButton}</button>
      </header>

      <section className="draft3-hero" id="draft3-main">
        <p>{serviceData.eyebrow}</p>
        <h1>도착 전에 확인하는<br /><em>따릉이 대여 가능성</em></h1>
        <span>{serviceData.description}</span>

        <div className="draft3-search-card">
          <label>
            <span>{serviceData.originLabel}</span>
            <input placeholder={serviceData.originPlaceholder} />
          </label>
          <i aria-hidden="true">→</i>
          <label>
            <span>{serviceData.destinationLabel}</span>
            <input placeholder={serviceData.destinationPlaceholder} />
          </label>
          <div className="draft3-modes">
            {serviceData.modes.map((mode) => (
              <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">{mode}</button>
            ))}
          </div>
          <button className="draft3-predict" type="button">{serviceData.predictButton}</button>
        </div>
      </section>

      <section className="draft3-results">
        <div className="draft3-section-heading">
          <div>
            <p>{serviceData.resultSummary}</p>
            <h2>{serviceData.resultTitle}</h2>
          </div>
          <span>같은 예시 데이터 · 3개 대여소</span>
        </div>

        <div className="draft3-result-grid">
          <div className="draft3-cards">
            {stations.map((station, index) => (
              <article className={index === 0 ? "recommended" : ""} key={station.id}>
                <div className="draft3-card-top">
                  <span>{station.role}</span>
                  <b className={`level-${station.availability}`}>{station.availability}</b>
                </div>
                <h3>{station.name}</h3>
                <p>{station.distance}</p>
                <dl>
                  <div><dt>현재 자전거</dt><dd>{station.bikes}대</dd></div>
                  <div><dt>예상 도착시간</dt><dd>{station.arrivalTime}</dd></div>
                  <div><dt>대여 가능성</dt><dd>{station.probability}</dd></div>
                </dl>
              </article>
            ))}
          </div>

          <div className="draft3-map" aria-label={serviceData.mapLabel}>
            <span className="draft3-map-title">{serviceData.mapLabel}</span>
            <div className="draft3-map-grid" />
            {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
            {stations.map((station, index) => (
              <div className={`draft3-dot dot-${index + 1}`} key={station.id}>
                <b>{index + 1}</b><span>{station.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="draft3-login-notice">
          <span aria-hidden="true">↗</span>
          <p>{serviceData.loginNotice}</p>
          <button type="button">{serviceData.loginButton}</button>
        </div>
      </section>
    </main>
  );
}

export default Draft3SearchFirst;

