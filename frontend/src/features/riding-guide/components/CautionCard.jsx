import GuideIcon from "./GuideIcon";
import { AIR_QUALITY_GRADE_LABEL } from "../data/airQualityMock";
import { formatClockTime } from "../data/ridingGuideFormatters";

function findRainStartHour(arrivalWeather) {
  if (!arrivalWeather || !Array.isArray(arrivalWeather.hourlyForecasts)) return null;
  const sorted = [...arrivalWeather.hourlyForecasts].sort((a, b) => a.forecastAt.localeCompare(b.forecastAt));
  const rainyItem = sorted.find((item) =>
    (item.precipitationType && item.precipitationType !== "NONE") || (item.precipitationProbabilityPercent ?? 0) >= 50
  );
  if (!rainyItem || !rainyItem.forecastAt || !rainyItem.forecastAt.includes("T")) return null;
  return { hourLabel: `${rainyItem.forecastAt.split("T")[1].slice(0, 2)}시`, pop: rainyItem.precipitationProbabilityPercent };
}

export function buildWarnings(candidate, arrivalWeather, airQuality) {
  const items = [];

  if (candidate?.availabilityLevel === "LOW") {
    items.push({
      key: "availability",
      icon: "bike",
      text: "이 대여소는 대여 가능성이 낮아요 — 대체 대여소를 확인해보세요.",
    });
  }

  if (candidate?.currentInventory?.inventoryStatus === "DELAYED") {
    const time = formatClockTime(candidate.currentInventory.collectedAt);
    items.push({
      key: "inventory-delayed",
      icon: "clock",
      text: time ? `재고 정보가 지연되고 있어요(최근 확인 ${time}).` : "재고 정보가 지연되고 있어요.",
    });
  }

  const rainStart = findRainStartHour(arrivalWeather);
  if (rainStart) {
    items.push({ key: "rain", icon: "rain", text: `${rainStart.hourLabel}부터 강수확률 ${rainStart.pop}%로 올라요.` });
  } else if (arrivalWeather?.rainGuidance === true) {
    items.push({ key: "rain", icon: "rain", text: "도착 예정 시간대에 강수 가능성이 있어요." });
  }

  const grade = airQuality?.khai?.grade;
  const pm10Value = airQuality?.pm10?.value;
  if (grade === "MODERATE" || grade === "BAD" || grade === "VERY_BAD") {
    const gradeLabel = AIR_QUALITY_GRADE_LABEL[grade];
    items.push({
      key: "air",
      dots: true,
      text: pm10Value !== null && pm10Value !== undefined
        ? `PM10 ${pm10Value}㎍/㎥ ${gradeLabel} — 민감군 장시간 이용 주의`
        : `미세먼지 ${gradeLabel} — 민감군 장시간 이용 주의`,
    });
  }

  items.push({ key: "info", icon: "info", text: "예보와 측정값은 갱신 시점에 따라 달라질 수 있어요." });
  return items;
}

export default function CautionCard({ candidate = null, arrivalWeather = null, airQuality = null }) {
  const warnings = buildWarnings(candidate, arrivalWeather, airQuality);

  return (
    <section className="guide-card guide-warnings" aria-labelledby="warnings-title">
      <h2 id="warnings-title">주의사항</h2>
      <ul>
        {warnings.map((item) => (
          <li key={item.key}>
            {item.dots ? <span className="guide-small-dots" aria-hidden="true" /> : <GuideIcon name={item.icon} />}
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
