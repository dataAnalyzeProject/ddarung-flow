import "./Draft6CardCanvas.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

export function Draft6CardCanvas() {
  return (
    <main className="draft6-shell">
      <header className="draft6-header">
        <div className="draft6-brand"><span>SEOUL BIKE</span><strong>{serviceData.serviceName}</strong></div>
        <div className="draft6-status">● {serviceData.resultSummary}</div>
        <button type="button">{serviceData.loginButton}</button>
      </header>

      <section className="draft6-search">
        <div><p>{serviceData.eyebrow}</p><h1>{serviceData.description}</h1></div>
        <div className="draft6-fields">
          <label><span>{serviceData.originLabel}</span><input placeholder={serviceData.originPlaceholder} /></label>
          <i>→</i>
          <label><span>{serviceData.destinationLabel}</span><input placeholder={serviceData.destinationPlaceholder} /></label>
        </div>
        <div className="draft6-actions">
          {serviceData.modes.map((mode) => <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">{mode}</button>)}
          <button className="draft6-submit" type="button">{serviceData.predictButton}</button>
        </div>
      </section>

      <section className="draft6-results">
        <div className="draft6-title"><h2>{serviceData.resultTitle}</h2><span>대여소 3곳</span></div>
        <div className="draft6-card-grid">
          {stations.map((station, index) => (
            <article className={`draft6-card card-${index + 1}`} key={station.id}>
              <header><span>{station.role}</span><strong>{station.probability}</strong></header>
              <h3>{station.name}</h3><p>{station.distance}</p>
              <div className="draft6-bike"><b>{station.bikes}</b><span>현재 자전거<br />대</span></div>
              <dl><div><dt>예상 도착시간</dt><dd>{station.arrivalTime}</dd></div><div><dt>대여 가능성</dt><dd>{station.availability}</dd></div></dl>
            </article>
          ))}
          <div className="draft6-map" aria-label={serviceData.mapLabel}>
            <span className="draft6-map-title">{serviceData.mapLabel}</span><div className="draft6-map-grid" />
            {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
            {stations.map((station, index) => <span className={`draft6-dot dot-${index + 1}`} key={station.id}>{index + 1}</span>)}
          </div>
        </div>
        <div className="draft6-login"><span>+</span><p>{serviceData.loginNotice}</p><button type="button">{serviceData.loginButton}</button></div>
      </section>
    </main>
  );
}

export default Draft6CardCanvas;
