import "./Draft1MapFirst.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

export function Draft1MapFirst() {
  const recommended = stations[0];

  return (
    <main className="draft1-shell">
      <header className="draft1-header">
        <div>
          <span className="draft1-mark" aria-hidden="true">따</span>
          <strong>{serviceData.serviceName}</strong>
        </div>
        <button type="button">{serviceData.loginButton}</button>
      </header>

      <section className="draft1-map" aria-label={serviceData.mapLabel}>
        <div className="draft1-map-grid" aria-hidden="true" />
        {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
        <span className="draft1-river" aria-hidden="true" />

        <div className="draft1-search-panel">
          <p className="draft1-eyebrow">{serviceData.eyebrow}</p>
          <h1>{serviceData.description}</h1>
          <div className="draft1-fields">
            <label>
              <span>{serviceData.originLabel}</span>
              <input placeholder={serviceData.originPlaceholder} />
            </label>
            <span className="draft1-arrow" aria-hidden="true">→</span>
            <label>
              <span>{serviceData.destinationLabel}</span>
              <input placeholder={serviceData.destinationPlaceholder} />
            </label>
          </div>
          <div className="draft1-actions">
            <div className="draft1-segmented">
              {serviceData.modes.map((mode) => (
                <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">
                  {mode}
                </button>
              ))}
            </div>
            <button className="draft1-predict" type="button">{serviceData.predictButton}</button>
          </div>
        </div>

        {stations.map((station, index) => (
          <div className={`draft1-pin draft1-pin-${index + 1}`} key={station.id}>
            <span>{index + 1}</span>
            <small>{station.bikes}대</small>
          </div>
        ))}

        <article className="draft1-result">
          <div className="draft1-result-head">
            <div>
              <span>{recommended.role}</span>
              <h2>{recommended.name}</h2>
              <p>{recommended.distance}</p>
            </div>
            <strong>{recommended.probability}</strong>
          </div>
          <div className="draft1-stats">
            <div><span>현재 자전거</span><b>{recommended.bikes}대</b></div>
            <div><span>예상 도착시간</span><b>{recommended.arrivalTime}</b></div>
            <div><span>대여 가능성</span><b className="high">{recommended.availability}</b></div>
          </div>
          <div className="draft1-alternatives">
            {stations.slice(1).map((station) => (
              <p key={station.id}>
                <span>{station.role}</span>
                <b>{station.name}</b>
                <em>{station.bikes}대 · {station.arrivalTime} · {station.availability}</em>
              </p>
            ))}
          </div>
          <p className="draft1-login">{serviceData.loginNotice}</p>
        </article>
      </section>
    </main>
  );
}

export default Draft1MapFirst;

