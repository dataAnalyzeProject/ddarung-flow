function percent(value) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : '판단 정보 부족'; }

export default function PriorityStationList({ items, selectedStationNumber, onSelect }) {
  return <section className="ops-dashboard-panel ops-priority-panel" aria-labelledby="priority-title">
    <div className="ops-panel-heading"><div><h2 id="priority-title">우선 확인 Top 5</h2><p>API 응답 순서를 그대로 표시합니다.</p></div></div>
    <ol className="ops-priority-list">
      {items.map((item, index) => {
        const number = item.station.stationNumber;
        const selected = selectedStationNumber === number;
        return <li key={number}><button type="button" onClick={() => onSelect(number)} aria-current={selected ? 'true' : undefined} className={selected ? 'selected' : ''}>
          <span className="ops-rank">{index + 1}</span><span className="ops-station"><strong>{item.station.name}</strong><small>{number} · 현재 {item.station.currentBikes ?? '판단 정보 부족'}대 · {item.dataState}</small></span><span className={`ops-band ops-risk-${item.riskBand || 'unknown'}`}>{item.riskBand || '판단 정보 부족'}</span><span className="ops-probability">{percent(item.rentalRisk?.selectedShortageProbability)}</span>
        </button></li>;
      })}
    </ol>
  </section>;
}
