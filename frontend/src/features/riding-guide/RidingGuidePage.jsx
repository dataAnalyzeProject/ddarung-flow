import AppHeader from "../../shared/AppHeader";
import "./RidingGuidePage.css";

const hourlyFixture = [
  { time: "09시", temperature: "21°C", rain: "10%", condition: "추천", tone: "safe" },
  { time: "11시", temperature: "24°C", rain: "10%", condition: "추천", tone: "safe", current: true },
  { time: "13시", temperature: "26°C", rain: "20%", condition: "추천", tone: "safe" },
  { time: "15시", temperature: "25°C", rain: "30%", condition: "주의", tone: "caution" },
  { time: "17시", temperature: "23°C", rain: "50%", condition: "주의", tone: "caution" },
];

const guideMetrics = [
  { icon: "bike", label: "대여 가능성", value: "87%", note: "매우 높음", tone: "safe" },
  { icon: "rain", label: "강수확률", value: "10%", note: "낮음", tone: "blue" },
  { icon: "wind", label: "풍속", value: "2m/s", note: "양호", tone: "blue" },
  { icon: "air", label: "통합대기환경지수", value: "63", note: "보통", tone: "caution" },
];

const iconPaths = {
  arrow: "M15 4l-8 8 8 8M7 12h14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.7-3.4 3.1-5 7-5s6.3 1.6 7 5",
  bike: "M7 17a4 4 0 1 1-4-4 4 4 0 0 1 4 4Zm14 0a4 4 0 1 1-4-4 4 4 0 0 1 4 4ZM7 17l4-8 4 8M9 11h7l-2-4h-3M15 17h2l-3-8",
  rain: "M7 16h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.2 1.5A3.4 3.4 0 0 0 7 16Zm2 3-1 2m5-2-1 2m5-2-1 2",
  wind: "M3 8h11c2.5 0 2.5-4 0-4m-11 8h16c2.8 0 2.8-4 0-4m-16 8h10c2.8 0 2.8 4 0 4",
  air: "M12 4v.01M6.3 6.3v.01m11.4 0v.01M4 12v.01m16 0v.01M6.3 17.7v.01m11.4 0v.01M12 20v.01",
  leaf: "M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16ZM5 21c2-5 6-8 11-10",
  route: "M6 9c2-2.4 3-4.1 3-5.2a3 3 0 1 0-6 0C3 4.9 4 6.6 6 9Zm12 12c2-2.4 3-4.1 3-5.2a3 3 0 1 0-6 0c0 1.1 1 2.8 3 5.2ZM6 9c0 5 12 2 12 7",
  thermometer: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0ZM12 8v9",
  umbrella: "M4 11a8 8 0 0 1 16 0H4Zm8 0v7c0 3 4 3 4 0",
  info: "M12 11v6m0-10h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  warning: "M12 4 3 20h18L12 4Zm0 5v5m0 3h.01",
  transit: "M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2Zm-2 8h16M7 20l2-4m8 4-2-4M8 8h3m2 0h3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v5l3 2",
  status: "M5 5h14v14H5V5Zm3 7 2.5 2.5L16 9",
};

function GuideIcon({ name, className = "", title }) {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={`guide-icon ${className}`}
      fill="none"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[name] || iconPaths.info} />
    </svg>
  );
}

export default function RidingGuidePage({ stationName = "성수역 3번 출구", onBack, onNavigate }) {
  const returnToPrediction = () => onBack?.();

  return (
    <main className="riding-guide-shell">
      <AppHeader onHome={onBack} onNavigate={onNavigate} />

      <div className="guide-page">
        <button className="guide-back" type="button" onClick={returnToPrediction}>
          <GuideIcon name="arrow" />
          대여 예측으로 돌아가기
        </button>

        <section className="guide-intro" aria-labelledby="riding-guide-title">
          <div className="guide-intro-title">
            <div>
              <h1 id="riding-guide-title">{stationName} 라이딩 가이드</h1>
              <p>도착 예정시간 11:05 기준</p>
            </div>
            <span className="guide-badge">자전거 이용 추천</span>
          </div>
          <div className="guide-intro-copy">
            <strong>대여 가능성이 높고 날씨와 대기질도 자전거 이용에 적합해요.</strong>
            <p>
              기상청 · 에어코리아 · 따릉이 예측 데이터
              <GuideIcon name="info" title="화면 데이터 출처 안내" />
            </p>
          </div>
        </section>

        <div className="guide-dashboard">
          <section className="guide-card guide-overall" id="guide-overall" aria-labelledby="overall-title">
            <h2 id="overall-title">종합 라이딩 가이드</h2>
            <div className="guide-overall-verdict">
              <div className="guide-rating-ring"><strong>좋음</strong></div>
              <p>지금 출발하면<br />자전거 이용을 <span>추천해요.</span></p>
            </div>
            <dl className="guide-metrics">
              {guideMetrics.map((metric) => (
                <div key={metric.label}>
                  <span className={`guide-metric-icon ${metric.tone}`}><GuideIcon name={metric.icon} /></span>
                  <dt>{metric.label}</dt>
                  <dd className={metric.tone}>{metric.value} <small>· {metric.note}</small></dd>
                </div>
              ))}
            </dl>
            <div className="guide-eco-tip">
              <GuideIcon name="leaf" />
              <p><strong>오후 6시 전까지 이용하기 좋아요.</strong><span>장거리 이동 시에는 미세먼지 변화를 확인하세요.</span></p>
            </div>
            <button className="guide-route-back" type="button" onClick={returnToPrediction}>
              <GuideIcon name="route" />
              경로 다시 보기
            </button>
          </section>

          <section className="guide-center-column" aria-label="시간대별 날씨와 대기질">
            <section className="guide-card guide-hourly" aria-labelledby="hourly-title">
              <header className="guide-card-heading">
                <h2 id="hourly-title">시간대별 라이딩 환경</h2>
                <p><span className="safe" />추천 <span className="caution" />주의</p>
              </header>
              <div className="guide-hourly-timeline" aria-label="09시부터 17시까지 시간대별 변화">
                <span aria-hidden="true" />
                {hourlyFixture.map((hour) => (
                  <div className={hour.current ? "current" : ""} key={hour.time}>
                    <span>{hour.time}</span>
                    <i className={hour.tone} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div className="guide-hourly-table-wrap">
                <table className="guide-hourly-table">
                  <caption className="sr-only">시간대별 기온, 강수확률과 라이딩 환경</caption>
                  <tbody>
                    <tr><th scope="row">기온 (°C)</th>{hourlyFixture.map((hour) => <td aria-label={`${hour.time} ${hour.temperature}`} className={hour.current ? "current safe-text" : ""} key={hour.time}>{hour.temperature}</td>)}</tr>
                    <tr><th scope="row">강수확률 (%)</th>{hourlyFixture.map((hour) => <td aria-label={`${hour.time} 강수확률 ${hour.rain}`} className={`${hour.current ? "current safe-text" : ""} ${hour.tone === "caution" ? "caution-text" : ""}`} key={hour.time}>{hour.rain}</td>)}</tr>
                    <tr><th scope="row">라이딩 환경</th>{hourlyFixture.map((hour) => <td aria-label={`${hour.time} 라이딩 환경 ${hour.condition}`} className={hour.current ? "current" : ""} key={hour.time}><span className={`guide-condition ${hour.tone}`}>{hour.condition}</span></td>)}</tr>
                  </tbody>
                </table>
              </div>
            </section>

            <div className="guide-arrival-grid">
              <section className="guide-card guide-weather" aria-labelledby="arrival-weather-title">
                <h2 id="arrival-weather-title">도착지 날씨</h2>
                <div className="guide-weather-body">
                  <div className="guide-weather-summary">
                    <div className="guide-sun" aria-label="맑음"><span /></div>
                    <div className="guide-temperature"><strong>24°C</strong><span>맑음</span></div>
                  </div>
                  <dl>
                    <div><dt><GuideIcon name="thermometer" />체감온도</dt><dd>25°C</dd></div>
                    <div><dt><GuideIcon name="rain" />강수확률</dt><dd>10%</dd></div>
                    <div><dt><GuideIcon name="wind" />풍속</dt><dd>2m/s</dd></div>
                    <div><dt><GuideIcon name="umbrella" />17시 이후 비 가능성</dt><dd /></div>
                  </dl>
                </div>
              </section>

              <section className="guide-card guide-air" aria-labelledby="arrival-air-title">
                <h2 id="arrival-air-title">도착지 대기질</h2>
                <div className="guide-air-body">
                  <div className="guide-air-dots" aria-label="통합대기환경지수 보통"><span /></div>
                  <dl className="guide-air-values">
                    <div><dt>PM10</dt><dd>42<small>㎍/㎥</small><em className="caution-text">보통</em></dd></div>
                    <div><dt>PM2.5</dt><dd>18<small>㎍/㎥</small><em className="safe-text">좋음</em></dd></div>
                    <div><dt>오존 (O₃)</dt><dd>0.031<small>ppm</small><em className="caution-text">보통</em></dd></div>
                  </dl>
                </div>
                <dl className="guide-air-meta">
                  <div><dt>측정소</dt><dd>천호 측정소</dd></div>
                  <div><dt>측정시간</dt><dd>10:00 기준</dd></div>
                </dl>
              </section>
            </div>
          </section>

          <aside className="guide-side-column" aria-label="대여 예측과 이용 안내">
            <section className="guide-card guide-summary" aria-labelledby="summary-title">
              <h2 id="summary-title">대여 예측 요약</h2>
              <div className="guide-summary-body">
                <div className="guide-percent-ring"><strong>87<small>%</small></strong></div>
                <p><b>매우 높음</b><span>{stationName}</span><span>현재 <strong>8대</strong></span><span>도착 시 <strong>5~9대</strong> 예상</span></p>
              </div>
              <a className="guide-station-link" href="#guide-overall">대여소 상세보기<span aria-hidden="true">›</span></a>
            </section>

            <section className="guide-card guide-warnings" aria-labelledby="warnings-title">
              <h2 id="warnings-title">주의사항</h2>
              <ul>
                <li><GuideIcon name="rain" />오후 5시 이후 강수확률 상승</li>
                <li><span className="guide-small-dots" aria-hidden="true" />미세먼지 보통 — 민감군 장시간 이용 주의</li>
                <li><GuideIcon name="info" />예보와 측정값은 갱신 시점에 따라 달라질 수 있어요.</li>
              </ul>
            </section>

            <section className="guide-card guide-transit" aria-labelledby="transit-title">
              <h2 id="transit-title">대안 이동</h2>
              <div className="guide-transit-copy">
                <span><GuideIcon name="transit" /></span>
                <p>날씨가 나빠지면 대중교통으로 전환<small>도보 3분 · 지하철 22분</small></p>
              </div>
              <button type="button">대중교통 경로 보기<span aria-hidden="true">›</span></button>
            </section>
          </aside>
        </div>

        <footer className="guide-status" aria-label="데이터 상태">
          <span><GuideIcon name="status" /><b>데이터 상태</b><i className="guide-status-ok">✓</i> 정상</span>
          <span><i className="guide-status-spinner" /><b>날씨 발표</b>10:00</span>
          <span><GuideIcon name="air" /><b>대기질 측정</b>10:00</span>
          <span><GuideIcon name="clock" /><b>대여 예측 갱신</b>10:32</span>
          <span className="guide-status-note"><GuideIcon name="info" />실시간 측정값과 예측 결과는 실제 상황과 다를 수 있습니다.</span>
        </footer>
      </div>
    </main>
  );
}
