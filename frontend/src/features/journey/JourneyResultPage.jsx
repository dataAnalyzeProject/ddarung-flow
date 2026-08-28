import './JourneyPage.css';

export default function JourneyResultPage({ onNavigate }) { return <main className="journey-page"><section className="journey-hero"><p>UI-25 · Journey Result</p><h1>여정을 아직 만들 수 없습니다</h1><span>실제 장소·경로·대여·반납 제공자 연결 전에는 후보나 확률을 표시하지 않습니다.</span></section><section className="journey-unavailable" role="status"><h2>UNAVAILABLE</h2><p>Journey Phase A의 production provider integration이 비활성화되어 있습니다. 조건을 바꾸거나 제공자 연결 후 다시 시도해 주세요.</p></section><button onClick={() => onNavigate('journey')}>조건 다시 입력</button></main>; }
