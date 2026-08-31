import GuideIcon from "./GuideIcon";
import { formatClockTime } from "../data/ridingGuideFormatters";

export default function DataStatusFooter({ candidate = null, weather, airQuality = null, isAirQualityLoading = false }) {
  const dataStateOk = Boolean(candidate && weather && airQuality)
    && !["MISSING", "UNAVAILABLE"].includes(candidate.predictionStatus)
    && !["MISSING", "UNAVAILABLE"].includes(weather.status)
    && !["MISSING", "UNAVAILABLE"].includes(airQuality.status);
  const weatherIssuedTime = formatClockTime(weather?.issuedAt);
  const predictionUpdatedTime = candidate?.predictionGeneratedAt ? formatClockTime(candidate.predictionGeneratedAt) : null;
  const airQualityMeasuredTime = formatClockTime(airQuality?.measuredAt);

  return (
    <footer className="guide-status" aria-label="데이터 상태">
      <span>
        <GuideIcon name="status" /><b>데이터 상태</b>
        {dataStateOk ? <><i className="guide-status-ok">✓</i> 정상</> : <><GuideIcon name="warning" /> 일부 정보 없음</>}
      </span>
      <span><i className="guide-status-spinner" /><b>날씨 발표</b>{weatherIssuedTime || "-"}</span>
      <span><GuideIcon name="air" /><b>대기질 측정</b>{isAirQualityLoading || !airQuality ? "-" : airQualityMeasuredTime || "-"}</span>
      <span><GuideIcon name="clock" /><b>대여 예측 갱신</b>{predictionUpdatedTime || "-"}</span>
      <span className="guide-status-note"><GuideIcon name="info" />실시간 측정값과 예측 결과는 실제 상황과 다를 수 있습니다.</span>
    </footer>
  );
}
