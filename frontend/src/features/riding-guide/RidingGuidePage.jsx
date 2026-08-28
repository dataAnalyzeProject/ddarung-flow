import AppHeader from "../../shared/AppHeader";
import "./RidingGuidePage.css";
import { airQualityNormalFixture } from "./data/airQualityMock";
import { formatClockTime } from "./data/ridingGuideFormatters";
import RidingGuideHeader from "./components/RidingGuideHeader";
import OverallGuideCard, {
  computeIntroCopy,
  computeOverallVerdict,
  getGuideAvailabilityMetric,
  getGuideRainMetric,
} from "./components/OverallGuideCard";
import TimeBasedRideEnvironment, { buildHourlyRows, hourlyFixture } from "./components/TimeBasedRideEnvironment";
import ArrivalWeatherCard, { weatherFixtureFallback } from "./components/ArrivalWeatherCard";
import AirQualityCard, { getGuideKhaiMetric } from "./components/AirQualityCard";
import PredictionSummaryCard from "./components/PredictionSummaryCard";
import CautionCard from "./components/CautionCard";
import DataStatusFooter from "./components/DataStatusFooter";
import { GuideBikeCountCard, GuideSuccessRateCard } from "./components/GuidePredictionMetrics";

export default function RidingGuidePage({
  stationName = "성수역 3번 출구",
  candidate = null,
  arrivalWeather = null,
  isWeatherLoading = false,
  onBack,
  onNavigate,
  authState,
  user,
  onLogout,
  airQuality = airQualityNormalFixture,
  isAirQualityLoading = false,
}) {
  const returnToPrediction = () => onBack?.();
  const weatherData = arrivalWeather || weatherFixtureFallback;
  const guideMetricsWithAirQuality = [
    getGuideAvailabilityMetric(candidate),
    getGuideRainMetric(arrivalWeather),
    getGuideKhaiMetric(airQuality, isAirQualityLoading),
  ];
  const verdict = computeOverallVerdict(candidate, arrivalWeather);
  const introCopy = computeIntroCopy(verdict);
  const hourlyRows = buildHourlyRows(arrivalWeather) || hourlyFixture;
  const arrivalTimeLabel = formatClockTime(candidate?.arrivalAt) || "11:05";

  return (
    <main className="riding-guide-shell">
      <AppHeader authState={authState} user={user} onLogout={onLogout} onHome={onBack} onNavigate={onNavigate} />

      <div className="guide-page">
        <RidingGuideHeader
          stationName={stationName}
          arrivalTimeLabel={arrivalTimeLabel}
          badge={introCopy.badge}
          summary={introCopy.summary}
          onBack={returnToPrediction}
        />

        <div className="guide-dashboard">
          <OverallGuideCard verdict={verdict} metrics={guideMetricsWithAirQuality} onRouteBack={returnToPrediction} />

          <section className="guide-center-column" aria-label="시간대별 날씨와 대기질">
            <TimeBasedRideEnvironment hours={hourlyRows} />

            <div className="guide-arrival-grid">
              <ArrivalWeatherCard weather={weatherData} isLoading={isWeatherLoading} />
              <AirQualityCard airQuality={airQuality} isAirQualityLoading={isAirQualityLoading} />
            </div>
          </section>

          <aside className="guide-side-column" aria-label="대여 예측과 이용 안내">
            <GuideSuccessRateCard candidate={candidate} />
            <GuideBikeCountCard candidate={candidate} />
            <PredictionSummaryCard candidate={candidate} />
            <CautionCard candidate={candidate} arrivalWeather={arrivalWeather} airQuality={airQuality} />
          </aside>
        </div>

        <DataStatusFooter
          candidate={candidate}
          weather={weatherData}
          airQuality={airQuality}
          isAirQualityLoading={isAirQualityLoading}
        />
      </div>
    </main>
  );
}
