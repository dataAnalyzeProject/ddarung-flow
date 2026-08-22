import GuideIcon from "./GuideIcon";

export default function RidingGuideHeader({
  stationName,
  arrivalTimeLabel,
  badge,
  summary,
  onBack,
}) {
  return (
    <>
      <button className="guide-back" type="button" onClick={onBack}>
        <GuideIcon name="arrow" />
        대여 예측으로 돌아가기
      </button>

      <section className="guide-intro" aria-labelledby="riding-guide-title">
        <div className="guide-intro-title">
          <div>
            <h1 id="riding-guide-title">{stationName} 라이딩 가이드</h1>
            <p>도착 예정시간 {arrivalTimeLabel} 기준</p>
          </div>
          <span className="guide-badge">{badge}</span>
        </div>
        <div className="guide-intro-copy">
          <strong>{summary}</strong>
          <p>
            기상청 · 에어코리아 · 따릉이 예측 데이터
            <GuideIcon name="info" title="화면 데이터 출처 안내" />
          </p>
        </div>
      </section>
    </>
  );
}
