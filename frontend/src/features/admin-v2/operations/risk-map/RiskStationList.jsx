function bikes(value) { return value === null || value === undefined ? '재고 확인 필요' : `${value}대`; } function probability(value) { return value === null || value === undefined ? '판단 정보 부족' : `${Math.round(value * 100)}%`; }
const STATE_MESSAGE = {
  WAITING: '지도 범위를 확인하고 있습니다.',
  LOADING: '현재 지도 범위의 대여소를 분석하고 있습니다.',
  SCOPE_TOO_LARGE: '현재 지도 범위가 너무 넓습니다. 지도를 확대하면 이 범위의 대여소 목록을 확인할 수 있습니다.',
  EMPTY: '현재 지도 범위에 표시할 대여소가 없습니다.',
};

export default function RiskStationList({ items, state = 'SUCCESS', selectedStationNumber, onSelect, onLoadMore, loadingMore }) {
  const message = STATE_MESSAGE[state];
  return <section className="risk-station-list" aria-labelledby="risk-list-title">
    <h2 id="risk-list-title">대여소 목록</h2>
    {message ? <p className="risk-list-state" role="status">{message}</p> : <ol>{items.map((item) => { const number = item.station.stationNumber; return <li key={number}><button type="button" aria-current={selectedStationNumber === number ? 'true' : undefined} onClick={() => onSelect(number)}><strong>{item.station.name}</strong><span>{number}</span><span>현재 {bikes(item.station.currentBikes)}</span><span>{item.riskBand || '판단 정보 부족'} · {probability(item.rentalRisk?.selectedShortageProbability)}</span><time dateTime={item.predictionTargetAt}>{item.predictionTargetAt}</time><small>{item.dataState}</small></button></li>; })}</ol>}
    {state === 'SUCCESS' && onLoadMore ? <button type="button" className="risk-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? '불러오는 중' : '더 보기'}</button> : null}
  </section>;
}
