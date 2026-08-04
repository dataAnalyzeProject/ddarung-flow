import "./Draft5JourneyTimeline.css";
import { mapRoads, serviceData, stations } from "../data/mockData";

export function Draft5JourneyTimeline() {
  return (
    <main className="draft5-shell">
      <header className="draft5-header">
        <div><span>따</span><strong>{serviceData.serviceName}</strong></div>
        <p>{serviceData.description}</p>
        <button type="button">{serviceData.loginButton}</button>
      </header>

      <section className="draft5-hero">
        <div className="draft5-copy"><p>{serviceData.eyebrow}</p><h1>경로를 따라 만나는<br /><em>따릉이 대여 예측</em></h1></div>
        <div className="draft5-form">
          <label><span>01 {serviceData.originLabel}</span><input placeholder={serviceData.originPlaceholder} /></label>
          <i>↓</i>
          <label><span>02 {serviceData.destinationLabel}</span><input placeholder={serviceData.destinationPlaceholder} /></label>
          <div>{serviceData.modes.map((mode) => <button className={mode === serviceData.selectedMode ? "active" : ""} key={mode} type="button">{mode}</button>)}</div>
          <button className="draft5-submit" type="button">{serviceData.predictButton}</button>
        </div>
      </section>

      <section className="draft5-body">
        <div className="draft5-heading"><div><p>{serviceData.resultSummary}</p><h2>{serviceData.resultTitle}</h2></div><span>추천 순서대로 확인하세요</span></div>
        <div className="draft5-content">
          <div className="draft5-timeline">
            {stations.map((station, index) => (
              <article className={index === 0 ? "selected" : ""} key={station.id}>
                <div className="draft5-node">{index + 1}</div>
                <div className="draft5-card">
                  <header><span>{station.role}</span><strong>{station.probability}</strong></header>
                  <h3>{station.name}</h3><p>{station.distance}</p>
                  <dl>
                    <div><dt>현재 자전거</dt><dd>{station.bikes}대</dd></div>
                    <div><dt>예상 도착시간</dt><dd>{station.arrivalTime}</dd></div>
                    <div><dt>대여 가능성</dt><dd className={`level-${station.availability}`}>{station.availability}</dd></div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
          <div className="draft5-map" aria-label={serviceData.mapLabel}>
            <span className="draft5-map-label">{serviceData.mapLabel}</span><div className="draft5-map-grid" />
            {mapRoads.map((road) => <span key={road.id} className={road.className} />)}
            <div className="draft5-route" />
            {stations.map((station, index) => <div className={`draft5-pin pin-${index + 1}`} key={station.id}><b>{station.bikes}대</b><span>{station.name}</span></div>)}
          </div>
        </div>
        <footer className="draft5-login"><p>{serviceData.loginNotice}</p><button type="button">{serviceData.loginButton}</button></footer>
      </section>
    </main>
  );
}

export default Draft5JourneyTimeline;
