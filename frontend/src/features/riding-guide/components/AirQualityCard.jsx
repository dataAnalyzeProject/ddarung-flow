import GuideIcon from "./GuideIcon";
import { AIR_QUALITY_GRADE_LABEL } from "../data/airQualityMock";
import { formatClockTime, formatDistance } from "../data/ridingGuideFormatters";

const AIR_QUALITY_GRADE_TONE = {
  GOOD: "safe-text",
  MODERATE: "caution-text",
  BAD: "warn-text",
  VERY_BAD: "danger-text",
};

export function getGuideKhaiMetric(airQuality, isLoading) {
  const hidden = { icon: "air", label: "통합대기환경지수", value: "-", note: "정보 없음", tone: "" };
  if (isLoading || !airQuality) return hidden;
  if (airQuality.status === "MISSING" || airQuality.status === "UNAVAILABLE") return hidden;
  const hasValue = airQuality.khai && airQuality.khai.value !== null && airQuality.khai.value !== undefined;
  if (!hasValue) return hidden;
  return {
    icon: "air",
    label: "통합대기환경지수",
    value: String(airQuality.khai.value),
    note: AIR_QUALITY_GRADE_LABEL[airQuality.khai.grade] || "-",
    tone: airQuality.khai.grade === "GOOD" ? "safe" : "caution",
  };
}

function AirQualityValue({ label, pollutant, unit }) {
  const hasValue = pollutant && pollutant.value !== null && pollutant.value !== undefined;
  const tone = hasValue ? AIR_QUALITY_GRADE_TONE[pollutant.grade] || "" : "";
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {hasValue ? (
          <>
            <span>{pollutant.value}</span>
            <small>{unit}</small>
            <em className={tone}>{AIR_QUALITY_GRADE_LABEL[pollutant.grade] || "-"}</em>
          </>
        ) : (
          <span aria-label={`${label} 측정값 없음`}>-</span>
        )}
      </dd>
    </div>
  );
}

function AirQualityLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="guide-air-loading" role="status">
      <span className="guide-air-skeleton" />
      <p>대기질 정보를 불러오는 중이에요.</p>
    </div>
  );
}

function AirQualityUnavailableNotice({ status }) {
  const message =
    status === "MISSING"
      ? "측정값이 없어 대기질을 표시할 수 없어요."
      : "대기질 정보를 조회할 수 없어요.";
  return (
    <div className="guide-air-unavailable" role="status">
      <GuideIcon name="warning" />
      <p>{message}</p>
    </div>
  );
}

export default function AirQualityCard({ airQuality, isAirQualityLoading = false }) {
  const airQualityMeasuredTime = formatClockTime(airQuality?.measuredAt);
  const airQualityDistanceText = formatDistance(airQuality?.measurementStationDistanceMeters);

  return (
    <section className="guide-card guide-air" aria-labelledby="arrival-air-title">
      <h2 id="arrival-air-title">도착지 대기질</h2>
      {isAirQualityLoading || !airQuality ? (
        <AirQualityLoading />
      ) : airQuality.status === "MISSING" || airQuality.status === "UNAVAILABLE" ? (
        <AirQualityUnavailableNotice status={airQuality.status} />
      ) : (
        <>
          <div className="guide-air-body">
            <div
              className="guide-air-dots"
              aria-label={`통합대기환경지수 ${AIR_QUALITY_GRADE_LABEL[airQuality.khai?.grade] || "정보 없음"}`}
            >
              <span />
            </div>
            <dl className="guide-air-values">
              <AirQualityValue label="PM10" pollutant={airQuality.pm10} unit="㎍/㎥" />
              <AirQualityValue label="PM2.5" pollutant={airQuality.pm25} unit="㎍/㎥" />
              <AirQualityValue label="오존 (O₃)" pollutant={airQuality.o3} unit="ppm" />
            </dl>
          </div>
          <dl className="guide-air-meta">
            <div><dt>측정소</dt><dd>{airQuality.measurementStation}</dd></div>
            {airQualityDistanceText && (
              <div><dt>대여소와의 거리</dt><dd>{airQualityDistanceText}</dd></div>
            )}
            <div><dt>측정시간</dt><dd>{airQualityMeasuredTime ? `${airQualityMeasuredTime} 기준` : "-"}</dd></div>
          </dl>
          {airQuality.status === "DELAYED" && (
            <p className="guide-air-delayed-note" role="status">
              <GuideIcon name="info" />
              측정값 갱신이 지연되고 있어요.
            </p>
          )}
        </>
      )}
    </section>
  );
}
