function percent(value) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : '판단 정보 부족'; }
function targetTime(value) { return value ? new Date(value).toLocaleString('ko-KR') : '예측 대상 시각 없음'; }
function stateNotice(state, dataState) {
  const labels = { DELAYED: '정보 갱신 지연', PARTIAL: '일부 데이터 누락', INSUFFICIENT_DATA: '판단 정보 부족', UNAVAILABLE: '현재 사용할 수 없음' };
  return state !== 'SUCCESS' && labels[state] ? `${labels[state]} · ${dataState}` : null;
}

export default function PriorityStationList({ items, selectedStationNumber, onSelect, state, dataState, horizonMinutes, requiredBikeCount }) {
  return <section className="ops-dashboard-panel ops-priority-panel" aria-labelledby="priority-title">
    <div className="ops-panel-heading"><div><h2 id="priority-title">대여 부족 확률 상위 5곳</h2><p>서울 전체 NORMAL 대여소 중 {horizonMinutes}분 후 {requiredBikeCount}대 이상을 확보하지 못할 확률이 높은 5곳입니다. 동률은 대여소 번호순입니다.</p>{stateNotice(state, dataState) ? <p className="ops-risk-state-notice" role="status">{stateNotice(state, dataState)}</p> : null}</div></div>
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
