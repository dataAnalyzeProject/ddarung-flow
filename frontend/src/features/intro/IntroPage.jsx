import { useCallback, useEffect, useRef } from "react";
import "./IntroPage.css";
import { markIntroSeen } from "./introStorage";
import logo from "../../assets/main/ddaragayo-logo.png";

const INTRO_DURATION_MS = 5000;

function IntroIcon({ name }) {
  const paths = {
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.7-3.4 3.1-5 7-5s6.3 1.6 7 5",
    chart: "M5 19v-5h3v5m3 0V9h3v10m3 0V5h3v14",
    book: "M4 5h6c1.2 0 2 .8 2 2v12c0-1.2-.8-2-2-2H4V5Zm16 0h-6c-1.2 0-2 .8-2 2v12c0-1.2.8-2 2-2h6V5Z",
    pin: "M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Zm0-10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    route: "M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 15h5c2 0 3-1 3-3V9",
    weather: "M8 16h9a4 4 0 0 0 .4-8 6 6 0 0 0-10.8 1.5A3.5 3.5 0 0 0 8 16Zm-2-7V5m3 2 2-2M4 12H1",
  };
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d={paths[name]} /></svg>;
}

function IntroBicycle() {
  const spokes = [0, 30, 60, 90, 120, 150];
  return (
    <svg className="intro-bike" aria-hidden="true" focusable="false" viewBox="0 0 420 280">
      <defs>
        <linearGradient id="introBikeFrame" x1="0" x2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dcecf1" /></linearGradient>
      </defs>
      <ellipse cx="210" cy="263" rx="181" ry="11" fill="#173855" opacity=".16" />
      {[102, 320].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="205" r="67" fill="#101820" />
          <circle cx={cx} cy="205" r="57" fill="#eff8fb" stroke="#82c900" strokeWidth="7" />
          <circle cx={cx} cy="205" r="4" fill="#132238" />
          {spokes.map((angle) => <line key={angle} x1={cx} y1="205" x2={cx + Math.cos(angle * Math.PI / 180) * 52} y2={205 + Math.sin(angle * Math.PI / 180) * 52} stroke="#9aabb6" strokeWidth="2" />)}
        </g>
      ))}
      <g fill="none" stroke="#15263a" strokeLinecap="round" strokeLinejoin="round">
        <path d="M102 205 158 158 231 205 260 103 320 205 231 205 158 158 260 103" strokeWidth="15" />
        <path d="M102 205 158 158 231 205 260 103 320 205 231 205 158 158 260 103" stroke="url(#introBikeFrame)" strokeWidth="10" />
        <path d="M102 205 148 95 158 158" strokeWidth="13" /><path d="M102 205 148 95 158 158" stroke="#edf5f5" strokeWidth="8" />
        <path d="M145 98 135 61 157 42M134 60l-25 3" strokeWidth="8" />
      </g>
      <path d="M246 96h38c7 0 9 9 2 12h-43Z" fill="#121b25" />
      <circle cx="231" cy="205" r="14" fill="#f7fbfc" stroke="#15263a" strokeWidth="5" />
      <path d="m231 205 31 24m-31-24-25-22" fill="none" stroke="#15263a" strokeWidth="5" strokeLinecap="round" />
      <g stroke="#15263a" strokeWidth="4" strokeLinejoin="round"><path d="M72 91h78l-9 62H82Z" fill="#dcecf0" /><path d="M86 91v62m18-62v62m19-62v62M72 110h75m-71 20h68" fill="none" strokeWidth="2.5" /></g>
      <path d="M250 118h30" stroke="#78bf17" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export default function IntroPage({ onComplete, storage = window.localStorage }) {
  const completedRef = useRef(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const featuresRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const completeIntro = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimers();
    markIntroSeen(storage);
    onComplete?.();
  }, [clearTimers, onComplete, storage]);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {}, 1000);
    timeoutRef.current = window.setTimeout(completeIntro, INTRO_DURATION_MS);
    return clearTimers;
  }, [clearTimers, completeIntro]);

  const showFeatures = (event) => {
    event.preventDefault();
    featuresRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    featuresRef.current?.focus();
  };

  return (
    <main className="intro-page" aria-label="따릉이 서비스 첫 방문 안내">
      <header className="intro-header">
        <a className="intro-brand" href="/" aria-label="따라가요 홈">
          <img src={logo} alt="따라가요" />
        </a>
        <nav aria-label="주요 메뉴">
          <a href="/">대여 예측</a>
          <a href="/#qna">Q&amp;A</a>
          <a href="/#saved">보관함</a>
          <a href="/#notifications">알림</a>
        </nav>
        <a className="intro-login" href="/login"><IntroIcon name="user" />로그인</a>
      </header>

      <div className="intro-content">
        <section className="intro-hero" aria-labelledby="intro-title">
          <div className="intro-copy">
            <h1 id="intro-title">출발하기 전에,<br /><span>도착지 <em>따릉이</em>부터 볼까요?</span></h1>
            <p>도착할 시간에 몇 대가 남아 있을지 미리 알려드려요.</p>
            <div className="intro-actions">
              <button className="intro-primary" type="button" onClick={completeIntro}><IntroIcon name="chart" />대여 가능성 예측 시작하기</button>
              <a className="intro-secondary" href="#intro-features" onClick={showFeatures}><IntroIcon name="book" />서비스 이용 방법</a>
            </div>
            <ul className="intro-points" aria-label="서비스 특징">
              <li><i className="green" />도착지 주변 대여소</li>
              <li><i className="blue" />도착시간 예상 대수</li>
              <li><i className="orange" />여유 있는 곳 추천</li>
            </ul>
            <p className="intro-auto-copy" aria-live="polite">5초 후 자동으로 대여 예측을 시작합니다.</p>
          </div>

          <div className="intro-scene" aria-label="출발지에서 도착지까지 이동하고 주변 대여소의 예상 자전거 수를 비교하는 일러스트">
            <span className="intro-cloud cloud-a" aria-hidden="true" /><span className="intro-cloud cloud-b" aria-hidden="true" />
            <div className="intro-buildings" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
            <span className="intro-mountain" aria-hidden="true" /><span className="intro-tower" aria-hidden="true" /><span className="intro-river" aria-hidden="true" /><span className="intro-bridge" aria-hidden="true" />
            <svg className="intro-route" aria-hidden="true" viewBox="0 0 800 260">
              <defs>
                <mask id="introRouteReveal"><path className="intro-route-mask" pathLength="1" d="M40 210C165 140 185 215 290 92S448 104 540 126s85 83 220-65" /></mask>
              </defs>
              <path className="intro-route-guide" d="M40 210C165 140 185 215 290 92S448 104 540 126s85 83 220-65" />
              <g mask="url(#introRouteReveal)">
                <path className="intro-route-line" d="M40 210C165 140 185 215 290 92S448 104 540 126s85 83 220-65" />
                <circle cx="45" cy="207" r="8" /><circle cx="291" cy="91" r="8" /><circle cx="758" cy="62" r="8" />
              </g>
              <g className="intro-moving-bike">
                <circle cx="-17" cy="0" r="12" /><circle cx="17" cy="0" r="12" />
                <path d="M-17 0-4-16 7 0h-24l13-16h18L17 0M-6-20h12M14-16l-4-10h9" />
              </g>
            </svg>
            <span className="intro-route-pin pin-a" aria-hidden="true"><IntroIcon name="pin" /></span><span className="intro-route-pin pin-b" aria-hidden="true"><IntroIcon name="pin" /></span>
            <span className="intro-destination-focus" aria-hidden="true" />
            <div className="intro-destination-forecast" role="group" aria-label="도착 예상 시간 기준 주변 대여소의 예상 자전거 수">
              <p><strong>도착지 주변</strong><span>도착 예상 시간 기준</span></p>
              <div className="intro-station-count station-best"><span className="station-dot" /><small>서울숲 입구</small><strong>예상 7대</strong><em>추천</em></div>
              <div className="intro-station-count station-second"><span className="station-dot" /><small>뚝섬역 2번 출구</small><strong>예상 5대</strong></div>
              <div className="intro-station-count station-third"><span className="station-dot" /><small>성수대교 북단</small><strong>예상 3대</strong></div>
            </div>
            <IntroBicycle />
          </div>
        </section>

        <section className="intro-feature-grid" id="intro-features" ref={featuresRef} tabIndex="-1" aria-label="서비스 이용 방법">
          <article><span className="feature-icon green"><IntroIcon name="pin" /></span><p><strong>도착 시 대여 가능성 예측</strong><small>목적지 주변 대여소를 추천해요</small></p></article>
          <article><span className="feature-icon blue"><IntroIcon name="route" /></span><p><strong>추천 대여소와 경로</strong><small>가장 가까운 대안까지 안내해요</small></p></article>
          <article><span className="feature-icon orange"><IntroIcon name="weather" /></span><p><strong>날씨 기반 이동 가이드</strong><small>도착 시간의 날씨를 함께 확인해요</small></p></article>
        </section>
      </div>

      <div className="intro-progress" aria-hidden="true"><span /></div>
    </main>
  );
}
