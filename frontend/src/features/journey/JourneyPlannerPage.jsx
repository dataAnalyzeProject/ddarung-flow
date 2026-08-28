import { useState } from 'react';
import './JourneyPage.css';

export default function JourneyPlannerPage({ authState, onNavigate }) {
  const [origin, setOrigin] = useState('성수역');
  const [destination, setDestination] = useState('서울숲');
  const [bikeCount, setBikeCount] = useState(1);
  const [notice, setNotice] = useState('');
  const submit = (event) => { event.preventDefault(); if (authState !== 'authenticated') { setNotice('로그인 후 입력을 확인하고 여정 만들기를 다시 눌러 주세요.'); return; } onNavigate('journey-result', 'phase-a-fixture'); };
  return <main className="journey-page"><section className="journey-hero"><p>UI-24 · Journey Planner</p><h1>여정 조건을 입력하세요</h1><span>Phase A 미리보기: 실제 장소·경로·확률 제공자는 아직 연결하지 않았습니다.</span></section><form className="journey-form" onSubmit={submit}><label>자연어 요청<textarea aria-label="자연어 요청" placeholder="성수에서 1시간, 오르막 적게" /></label><div className="journey-grid"><label>출발 장소<input aria-label="출발 장소" value={origin} onChange={(e) => setOrigin(e.target.value)} required /></label><label>최종 목적지<input aria-label="최종 목적지" value={destination} onChange={(e) => setDestination(e.target.value)} /></label><label>필요한 자전거 수<select aria-label="필요한 자전거 수" value={bikeCount} onChange={(e) => setBikeCount(e.target.value)}>{[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}</select></label><label>최대 이동 시간<select aria-label="최대 이동 시간"><option>60분</option><option>90분</option></select></label></div>{notice && <p role="status" className="journey-notice">{notice}</p>}<button type="submit">여정 만들기</button></form></main>;
}
