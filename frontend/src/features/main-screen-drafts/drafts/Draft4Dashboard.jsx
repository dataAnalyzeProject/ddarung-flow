import "./Draft4Dashboard.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

export function Draft4Dashboard() {
  return (
    <main className="draft4-shell">
      <aside className="draft4-nav">
        <div className="draft4-logo">따</div>
        <span className="active">⌂</span><span>⌕</span><span>◎</span>
        <button type="button">{serviceData.loginButton}</button>
      </aside>

      <section className="draft4-main">
        <header className="draft4-header">
          <div><p>{serviceData.eyebrow}</p><h1>{serviceData.serviceName}</h1></div>
          <span>{serviceData.description}</span>
        </header>

        <div className="draft4-search">
          <label><span>{serviceData.originLabel}</span><input placeholder={serviceData.originPlaceholder} /></label>
          <b>→</b>
          <label><span>{serviceData.destinationLabel}</span><input placeholder={serviceData.destinationPlaceholder} /></label>
          <div>{serviceData.modes.map((mode) => <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">{mode}</button>)}</div>
          <button className="draft4-submit" type="button">{serviceData.predictButton}</button>
        </div>

        <div className="draft4-grid">
          <section className="draft4-map" aria-label={serviceData.mapLabel}>
            <header><b>{serviceData.mapLabel}</b><span>{serviceData.resultSummary}</span></header>
            <div className="draft4-map-grid" />
            {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
            {stations.map((station, index) => (
              <div className={`draft4-pin pin-${index + 1}`} key={station.id}>
                <b>{station.bikes}</b><small>{station.name}</small>
              </div>
            ))}
          </section>

          <section className="draft4-list">
            <header><div><p>LIVE FORECAST</p><h2>{serviceData.resultTitle}</h2></div><strong>3</strong></header>
            {stations.map((station, index) => (
              <article className={index === 0 ? "best" : ""} key={station.id}>
                <div className="draft4-rank">{index + 1}</div>
                <div><span>{station.role}</span><h3>{station.name}</h3><p>{station.distance}</p></div>
                <dl>
                  <div><dt>현재 자전거</dt><dd>{station.bikes}대</dd></div>
                  <div><dt>예상 도착시간</dt><dd>{station.arrivalTime}</dd></div>
                  <div><dt>대여 가능성</dt><dd>{station.availability} · {station.probability}</dd></div>
                </dl>
              </article>
            ))}
            <p className="draft4-login">{serviceData.loginNotice}</p>
          </section>
        </div>
      </section>
    </main>
  );
}

export default Draft4Dashboard;
