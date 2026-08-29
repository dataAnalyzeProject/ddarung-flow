function percent(value) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : '판단 정보 부족'; }
function targetTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '예측 대상 시각 없음'; }
function stateNotice(state, dataState) {
  const labels = { DELAYED: '정보 갱신 지연', PARTIAL: '일부 데이터 누락', INSUFFICIENT_DATA: '판단 정보 부족', UNAVAILABLE: '현재 사용할 수 없음' };
  return state !== 'SUCCESS' && labels[state] ? `${labels[state]} · ${dataState}` : null;
}

export default function PriorityStationList({ items, selectedStationNumber, onSelect, state, dataState }) {
  return <section className="ops-dashboard-panel ops-priority-panel" aria-labelledby="priority-title">
    <div className="ops-panel-heading"><div><h2 id="priority-title">우선 확인 Top 5</h2><p>API 응답 순서를 그대로 표시합니다.</p>{stateNotice(state, dataState) ? <p className="ops-risk-state-notice" role="status">{stateNotice(state, dataState)}</p> : null}</div></div>
    <ol className="ops-priority-list">
      {items.map((item, index) => {
        const number = item.station.stationNumber;
        const selected = selectedStationNumber === number;
        return <li key={number}><button type="button" onClick={() => onSelect(number)} aria-current={selected ? 'true' : undefined} className={selected ? 'selected' : ''}>
          <span className="ops-rank">{index + 1}</span><span className="ops-station"><strong>{item.station.name}</strong><small>{number} · 현재 {item.station.currentBikes ?? '판단 정보 부족'}대 · {item.dataState}</small>{item.predictionTargetAt ? <time dateTime={item.predictionTargetAt}>예측 대상 {targetTime(item.predictionTargetAt)}</time> : <small>예측 대상 시각 없음</small>}</span><span className={`ops-band ops-risk-${item.riskBand || 'unknown'}`}>{item.riskBand || '판단 정보 부족'}</span><span className="ops-probability">{percent(item.rentalRisk?.selectedShortageProbability)}</span>
        </button></li>;
      })}
    </ol>
  </section>;
}
