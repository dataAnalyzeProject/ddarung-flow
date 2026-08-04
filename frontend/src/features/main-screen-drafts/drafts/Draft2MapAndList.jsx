import "./Draft2MapAndList.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

export function Draft2MapAndList() {
  return (
    <main className="draft2-shell">
      <aside className="draft2-sidebar">
        <p className="draft2-eyebrow">{serviceData.eyebrow}</p>
        <h1>{serviceData.serviceName}</h1>
        <p className="draft2-description">{serviceData.description}</p>

        <form className="draft2-form">
          <label>
            <span>01 · {serviceData.originLabel}</span>
            <input placeholder={serviceData.originPlaceholder} />
          </label>
          <label>
            <span>02 · {serviceData.destinationLabel}</span>
            <input placeholder={serviceData.destinationPlaceholder} />
          </label>
          <div className="draft2-mode">
            {serviceData.modes.map((mode) => (
              <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">{mode}</button>
            ))}
          </div>
          <button className="draft2-predict" type="button">{serviceData.predictButton}<span>→</span></button>
        </form>

        <div className="draft2-login">
          <span aria-hidden="true">◎</span>
          <p>{serviceData.loginNotice}</p>
          <button type="button">{serviceData.loginButton}</button>
        </div>
      </aside>

      <section className="draft2-content">
        <div className="draft2-topline">
          <div><span className="live-dot" /> {serviceData.resultSummary}</div>
          <strong>성수동 · 오후 2시 기준</strong>
        </div>

        <div className="draft2-workspace">
          <div className="draft2-map" aria-label={serviceData.mapLabel}>
            <div className="draft2-map-grid" />
            {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
            {stations.map((station, index) => (
              <div className={`draft2-marker marker-${index + 1}`} key={station.id}>
                <b>{station.bikes}</b><small>대</small>
              </div>
            ))}
            <div className="draft2-route" />
            <span className="draft2-origin">출발</span>
            <span className="draft2-destination">도착</span>
          </div>

          <div className="draft2-list">
            <header>
              <div>
                <p>STATION FORECAST</p>
                <h2>{serviceData.resultTitle}</h2>
              </div>
              <span>3곳</span>
            </header>
            {stations.map((station, index) => (
              <article className={index === 0 ? "featured" : ""} key={station.id}>
                <div className="draft2-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="draft2-station-main">
                  <span>{station.role}</span>
                  <h3>{station.name}</h3>
                  <p>{station.distance}</p>
                  <div>
                    <b>현재 {station.bikes}대</b>
                    <b>{station.arrivalTime} 도착</b>
                  </div>
                </div>
                <div className={`draft2-chance chance-${station.availability}`}>
                  <strong>{station.probability}</strong>
                  <span>대여 가능성 {station.availability}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default Draft2MapAndList;

