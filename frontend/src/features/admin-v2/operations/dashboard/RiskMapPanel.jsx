function position(items, index) {
  const points = items.map((item) => item.station?.coordinates).filter(Boolean);
  const latitude = items[index].station?.coordinates?.latitude;
  const longitude = items[index].station?.coordinates?.longitude;
  if (!points.length || latitude == null || longitude == null) return { left: '50%', top: '50%' };
  const latitudes = points.map((point) => Number(point.latitude));
  const longitudes = points.map((point) => Number(point.longitude));
  const latitudeRange = Math.max(...latitudes) - Math.min(...latitudes);
  const longitudeRange = Math.max(...longitudes) - Math.min(...longitudes);
  return {
    left: `${longitudeRange ? 12 + ((Number(longitude) - Math.min(...longitudes)) / longitudeRange) * 76 : 50}%`,
    top: `${latitudeRange ? 88 - ((Number(latitude) - Math.min(...latitudes)) / latitudeRange) * 76 : 50}%`,
  };
}

export default function RiskMapPanel({ items, selectedStationNumber, onSelect, referenceTime }) {
  return <section className="ops-dashboard-panel" aria-labelledby="risk-map-title">
    <div className="ops-panel-heading"><div><h2 id="risk-map-title">수급 위험 지도</h2><p>우선 확인 대여소 {items.length}곳</p></div>{referenceTime ? <small>지도 기준 {new Date(referenceTime).toLocaleString('ko-KR')}</small> : null}</div>
    <div className="ops-risk-map" aria-label="위험 대여소 위치">
      {items.map((item, index) => {
        const number = item.station.stationNumber;
        const selected = selectedStationNumber === number;
        return <button key={number} type="button" className={`ops-map-marker ops-risk-${item.riskBand || 'unknown'}`} style={position(items, index)} onClick={() => onSelect(number)} aria-pressed={selected} aria-label={`${index + 1}. ${item.station.name}, ${item.riskBand || '판단 정보 부족'}`}><span>{index + 1}</span><b>{item.riskBand || '판단 정보 부족'}</b></button>;
      })}
    </div>
  </section>;
}
