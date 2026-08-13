import { useState } from "react";
import "./MainPage.css";
import logo from "../../assets/main/ddaragayo-logo.png";
import routeMap from "../../assets/main/route-map.png";
import RidingGuidePage from "../riding-guide/RidingGuidePage";

const stations = [
  { id: 1, name: "성수역 3번 출구", distance: "120m · 도보 2분", bikes: 8, arrival: "11:05", range: "5~9대", rate: 87, level: "매우 높음" },
  { id: 2, name: "성수동 카페거리", distance: "310m · 도보 4분", bikes: 5, arrival: "11:07", range: "2~5대", rate: 72, level: "높음" },
  { id: 3, name: "서울숲 남문", distance: "480m · 도보 6분", bikes: 2, arrival: "11:09", range: "0~2대", rate: 45, level: "보통" },
];

const extraStations = [
  { name: "뚝섬역 1번 출구", distance: "620m · 도보 8분", bikes: 11, range: "7~12대", rate: 91, level: "매우 높음" },
  { name: "서울숲역 4번 출구", distance: "710m · 도보 9분", bikes: 7, range: "4~8대", rate: 81, level: "높음" },
  { name: "성수동 주민센터", distance: "840m · 도보 11분", bikes: 10, range: "6~11대", rate: 68, level: "보통" },
  { name: "서울숲 동문", distance: "960m · 도보 13분", bikes: 3, range: "1~4대", rate: 57, level: "보통" },
  { name: "성수대교 북단", distance: "1.1km · 도보 15분", bikes: 1, range: "0~2대", rate: 38, level: "낮음" },
];

const recommendationPool = [
  { name: "성수역 3번 출구", distance: "120m · 도보 2분", distanceM: 120, arrival: 5, bikes: 8, range: "5~9대", rate: 87, level: "매우 높음" },
  { name: "성수동 카페거리", distance: "310m · 도보 4분", distanceM: 310, arrival: 7, bikes: 5, range: "2~5대", rate: 72, level: "높음" },
  { name: "서울숲 남문", distance: "480m · 도보 6분", distanceM: 480, arrival: 9, bikes: 2, range: "0~2대", rate: 45, level: "보통" },
  { name: "뚝섬역 1번 출구", distance: "620m · 도보 8분", distanceM: 620, arrival: 11, bikes: 11, range: "7~12대", rate: 91, level: "매우 높음" },
  { name: "서울숲역 4번 출구", distance: "710m · 도보 9분", distanceM: 710, arrival: 12, bikes: 7, range: "4~8대", rate: 81, level: "높음" },
  { name: "성수동 주민센터", distance: "840m · 도보 11분", distanceM: 840, arrival: 14, bikes: 10, range: "6~11대", rate: 68, level: "보통" },
  { name: "서울숲 동문", distance: "960m · 도보 13분", distanceM: 960, arrival: 16, bikes: 3, range: "1~4대", rate: 57, level: "보통" },
  { name: "성수대교 북단", distance: "1.1km · 도보 15분", distanceM: 1100, arrival: 18, bikes: 1, range: "0~2대", rate: 38, level: "낮음" },
];

export default function MainPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [minutes, setMinutes] = useState("15");
  const [mode, setMode] = useState("도보");
  const [selected, setSelected] = useState(1);
  const [notice, setNotice] = useState(false);
  const [details, setDetails] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [mapMode, setMapMode] = useState("map");
  const [mapZoom, setMapZoom] = useState(1);
  const [routeRedrawn, setRouteRedrawn] = useState(false);
  const [stationSort, setStationSort] = useState("arrival");
  const [sortTouched, setSortTouched] = useState(false);
  const [moreStationsOpen, setMoreStationsOpen] = useState(false);
  const [sortedBookmarks, setSortedBookmarks] = useState([]);
  const sortedRecommendations = [...recommendationPool].sort((a, b) => {
    if (stationSort === "success") return b.rate - a.rate;
    if (stationSort === "bikes") return b.bikes - a.bikes;
    if (stationSort === "distance") return a.distanceM - b.distanceM;
    return a.arrival - b.arrival;
  }).slice(0, 3);
  if (details) {
    return <RidingGuidePage stationName={details.name} onBack={() => setDetails(null)} />;
  }

  return (
    <main className="ref-page">
      <header className="ref-header">
        <div className="ref-brand"><img src={logo} alt="따라가요" /><i /><strong>따릉이 도착 대여 예측</strong></div>
        <nav><b>대여 예측</b><span>Q&amp;A</span><span>보관함</span><span>알림</span></nav>
        <a href="/login" className="ref-login">♟ &nbsp; 로그인</a>
      </header>

      <section className="ref-hero">
        <div className="ref-copy"><h1>도착할 때 빌릴 수 있는<br /><em>따릉이를 미리 확인하세요.</em></h1><p>예상 도착시간 기준 대여 가능 여부를 알려드립니다.</p></div>
        <div className="ref-form">
          <label>출발지<input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="출발지를 입력하세요" /></label>
          <span className="ref-arrow">→</span>
          <label>목적지<input value={destination} onChange={e => setDestination(e.target.value)} placeholder="목적지를 입력하세요" /></label>
          <label className="ref-time">예상시간<div><select value={minutes} onChange={e => setMinutes(e.target.value)}><option value="15">15분 단위</option><option value="30">30분 단위</option><option value="60">60분 단위</option></select><button onClick={() => setNotice(true)}>시간 확인</button></div></label>
        </div>
        <div className="ref-actions"><small>이동 수단</small><div><button className={mode === "도보" ? "active" : ""} onClick={() => setMode("도보")}><b>♙</b>도보</button><button className={mode === "대중교통" ? "active" : ""} onClick={() => setMode("대중교통")}><b>▣</b>대중교통</button></div><button className="ref-predict" onClick={() => setNotice(true)}>▥ &nbsp; 대여 가능성 예측</button></div>
      </section>

      <section className="ref-grid">
        <section className="ref-stations">
          <header><h2>추천 대여소</h2><span>마지막 업데이트 10:32</span><select><option>예상 도착시간 기준</option></select></header>
          <div className="ref-list">{stations.map((s, i) => <article className={selected === s.id ? "selected" : ""} key={s.id} onClick={() => setSelected(s.id)}>
            <b className="rank">{i + 1}</b><div className="station-title"><h3>{s.name} {i === 0 && <em>추천</em>}</h3><small>도착지에서 {s.distance}</small></div>
            <div className="metric"><small>현재 자전거</small><strong>{s.bikes}<i>대</i></strong></div>
            <div className="metric"><small>예상 도착 시({s.arrival})</small><strong>{s.range}</strong></div>
            <div className="rate"><small>예상 대여 성공률</small><b>{s.rate}%</b><em>{s.level}</em></div>
            <button onClick={e => { e.stopPropagation(); setDetails(s); }}>상세보기</button>
          </article>)}</div>
          <button className="ref-more">더 많은 대여소 보기⌄</button>
        </section>

        <section className="ref-map"><header><h2>경로 및 추천 대여소 지도</h2><span>현재 자전거 수　● 많음　● 보통　● 적음</span></header><div><img src={routeMap} alt="천호동 경로 지도" /><button className="map-tab">지도</button><button className="sat-tab">위성</button><button className="redraw">⟳ 경로 다시 그리기</button><button className="zoom">＋<br />―</button><button className="expand" onClick={() => setMapOpen(true)}>지도 크게 보기 ↗</button></div></section>

        <aside className="ref-side">
          <section><h2>예상 대여 성공률 ⓘ</h2><div className="success"><strong>87%</strong><p><b>매우 높음</b><span>성수역 3번 출구 기준</span><em>도착 시 대여 가능성이 매우 높아요!</em></p></div></section>
          <section><h2>도착 시간대 혼잡도 ⓘ</h2><div className="chart">{[45,35,64,52,33].map((h,i)=><i key={i} className={i===2?"now":""} style={{height:h}}><b>{9+i}시</b></i>)}</div></section>
          <section><h2>날씨 &amp; 추천 이동 팁 ⓘ</h2><div className="weather"><b>☀</b><strong>24°C<small>맑음</small></strong><dl><div><dt>강수확률</dt><dd>10%</dd></div><div><dt>미세먼지</dt><dd>보통</dd></div><div><dt>바람</dt><dd>약 2m/s</dd></div></dl></div><p>날씨가 좋아 자전거 이용하기 좋은 날씨예요!</p></section>
        </aside>
      </section>

      {notice && <div className="ref-modal"><div><h2>로그인이 필요합니다.</h2><p>대여 가능성 예측을 이용하려면 로그인해 주세요.</p><button onClick={() => setNotice(false)}>닫기</button><a href="/login">로그인</a></div></div>}
      {mapOpen && <div className="ref-modal map"><div><h2>경로 및 추천 대여소 지도</h2><img src={routeMap} alt="확대 지도" /><button onClick={() => setMapOpen(false)}>닫기</button></div></div>}
      {moreStationsOpen && <div className="more-stations-modal" role="dialog" aria-modal="true" aria-label="더 많은 대여소"><div className="more-stations-panel"><header><div><h2>더 많은 대여소</h2><p>예상 도착시간을 기준으로 주변 대여소를 확인하세요.</p></div><button aria-label="추가 대여소 닫기" onClick={() => setMoreStationsOpen(false)}>×</button></header><div className="more-stations-list">{extraStations.map((station, index) => <article key={station.name}><b>{index + 4}</b><div className="extra-name"><strong>{station.name}</strong><small>{station.distance}</small></div><div><small>현재 자전거</small><strong>{station.bikes}대</strong></div><div><small>예상 도착 시</small><strong>{station.range}</strong></div><div className="extra-rate"><small>대여 성공률</small><strong>{station.rate}%</strong><em>{station.level}</em></div><button onClick={() => setNotice(true)}>상세보기</button></article>)}</div></div></div>}
      <div className="ref-hotspots" aria-label="Main controls">
        <button className="hot-more-stations" aria-label="더 많은 대여소 보기" onClick={() => setMoreStationsOpen(true)} />
        <div className={`hot-live-map ${mapMode}`} aria-hidden="true"><img src={routeMap} alt="" style={{ transform: `scale(${mapZoom})` }} /></div>
        <input className="hot-origin" aria-label="출발지" placeholder="출발지를 입력하세요" value={origin} onChange={e => setOrigin(e.target.value)} />
        <input className="hot-destination" aria-label="목적지" placeholder="목적지를 입력하세요" value={destination} onChange={e => setDestination(e.target.value)} />
        <select className="hot-time" aria-label="예상시간" value={minutes} onChange={e => setMinutes(e.target.value)}><option value="15">15분 단위</option><option value="30">30분 단위</option><option value="60">60분 단위</option></select>
        <button className="hot-confirm" aria-label="시간 확인" onClick={() => setNotice(true)} />
        <button className="hot-walk" aria-label="도보" aria-pressed={mode === "도보"} onClick={() => setMode("도보")} />
        <button className="hot-transit" aria-label="대중교통" aria-pressed={mode === "대중교통"} onClick={() => setMode("대중교통")} />
        <button className="hot-predict" aria-label="대여 가능성 예측" onClick={() => setNotice(true)} />
        <a className="hot-login" aria-label="로그인" href="/login" />
        <select className="hot-station-sort" aria-label="추천 대여소 정렬 기준" value={stationSort} onChange={e => { setStationSort(e.target.value); setSortTouched(true); }}>
          <option value="arrival">예상 도착시간 기준</option>
          <option value="distance">가까운 거리 기준</option>
          <option value="success">대여 성공률 기준</option>
          <option value="bikes">현재 자전거 수 기준</option>
        </select>
        <span className="hot-station-sort-label" aria-hidden="true">{{ arrival: "예상 도착시간 기준", distance: "가까운 거리 기준", success: "대여 성공률 기준", bikes: "현재 자전거 수 기준" }[stationSort]}</span>
        {sortTouched && <div className="hot-sorted-stations">{sortedRecommendations.map((station, index) => <article key={station.name}><b>{index + 1}</b><div className="sorted-name"><strong>{station.name}</strong><small>목적지에서 {station.distance}</small></div><button className={`sorted-bookmark ${sortedBookmarks.includes(station.name) ? "saved" : ""}`} aria-label={`${station.name} 즐겨찾기`} aria-pressed={sortedBookmarks.includes(station.name)} onClick={() => setSortedBookmarks(current => current.includes(station.name) ? current.filter(name => name !== station.name) : [...current, station.name])} /><div><small>현재 자전거</small><strong>{station.bikes}<i>대</i></strong></div><div><small>예상 도착 시</small><strong>{station.range}</strong></div><div className="sorted-rate"><small>대여 성공률</small><strong>{station.rate}%</strong><em>{station.level}</em></div><button className="sorted-detail" onClick={() => setDetails(station)}>상세보기</button></article>)}</div>}
        {stations.map((station, index) => <button key={`detail-${station.id}`} className={`hot-detail hot-detail-${index + 1}`} aria-label={`Station ${index + 1} details`} onClick={() => setDetails(station)} />)}
        {stations.map((station, index) => <button key={`bookmark-${station.id}`} className={`hot-bookmark hot-bookmark-${index + 1}`} type="button" aria-label={`Bookmark station ${index + 1}`} aria-pressed={bookmarks.includes(station.id)} onClick={() => setBookmarks(current => current.includes(station.id) ? current.filter(id => id !== station.id) : [...current, station.id])} />)}
        <button className="hot-map-tab" type="button" aria-label="지도" aria-pressed={mapMode === "map"} onClick={() => setMapMode("map")} />
        <button className="hot-satellite-tab" type="button" aria-label="위성" aria-pressed={mapMode === "satellite"} onClick={() => setMapMode("satellite")} />
        <button className="hot-redraw" type="button" aria-label="경로 다시 그리기" onClick={() => { setRouteRedrawn(true); setMapZoom(1); window.setTimeout(() => setRouteRedrawn(false), 1600); }} />
        <button className="hot-zoom-in" type="button" aria-label="지도 확대" onClick={() => setMapZoom(value => Math.min(1.5, Number((value + 0.1).toFixed(1))))} />
        <button className="hot-zoom-out" type="button" aria-label="지도 축소" onClick={() => setMapZoom(value => Math.max(0.8, Number((value - 0.1).toFixed(1))))} />
        {routeRedrawn && <span className="hot-map-message">경로를 다시 그렸습니다.</span>}
        <button className="hot-map" aria-label="지도 크게 보기" onClick={() => setMapOpen(true)} />
      </div>
    </main>
  );
}
