import { useEffect, useState } from "react";
import "./MainPage.css";
import { serviceData } from "./mainPageData";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";
import { fetchRouteCandidates } from "../map/candidatesApi";
import routeMap from "../../assets/main/route-map.png";
import AppHeader from "../../shared/AppHeader";
import MapRoutePanel from "../map/MapRoutePanel";
import LoginPromptModal from "./components/LoginPromptModal";
import MainSearchForm from "./components/MainSearchForm";
import StationRecommendationPanel from "./components/StationRecommendationPanel";
import PredictionSummaryPanel from "./components/PredictionSummaryPanel";
import { adaptCandidateResponse } from "../prediction-results/adaptCandidateResponse";
import RidingGuidePage from "../riding-guide/RidingGuidePage";
import { fetchAirQuality } from "../riding-guide/airQualityApi";
import { adaptArrivalWeather, fetchArrivalWeather } from "../weather/weatherApi";

const EMPTY_INPUT = {
  origin: "",
  destination: "",
  travelMode: serviceData.selectedMode,
  directMinutes: 15,
  requiredBikeCount: 1,
};

const TRAVEL_MODE_TO_API = { "도보": "WALK", "대중교통": "PUBLIC_TRANSIT" };
const PREDICTION_RESULT_KEY = "ddarung.mainPredictionResult.v1";

function loadSavedPredictionResult() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PREDICTION_RESULT_KEY));
    return Array.isArray(saved?.result?.candidates) ? saved : null;
  } catch {
    return null;
  }
}

// RidingGuidePage는 measurementStation을 표시용 문자열로, 거리는 별도 필드로 렌더링하므로
// 백엔드의 { name, distanceMeters } 객체를 두 필드로 나눠 전달한다.
function adaptAirQualityResponse(response) {
  if (!response) return null;
  return {
    ...response,
    measurementStation: response.measurementStation?.name ?? null,
    measurementStationDistanceMeters: response.measurementStation?.distanceMeters ?? null,
  };
}

export default function MainPage({ onNavigate }) {
  const [authState, setAuthState] = useState("anonymous");
  const [user, setUser] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [routePlaces, setRoutePlaces] = useState({ origin: null, destination: null });
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [apiPredictionResult, setApiPredictionResult] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [selectedStationInfo, setSelectedStationInfo] = useState(null);
  const [ridingGuideOpen, setRidingGuideOpen] = useState(false);
  const [guideAirQuality, setGuideAirQuality] = useState(null);
  const [guideAirQualityLoading, setGuideAirQualityLoading] = useState(false);
  const [arrivalWeather, setArrivalWeather] = useState(null);
  const [weatherRequest, setWeatherRequest] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    const loginResult = new URLSearchParams(window.location.search).get("login");
    const pendingInput = loadPendingPrediction();

    getCurrentUser()
      .then((auth) => {
        if (!auth.authenticated) {
          setAuthState("anonymous");
          return;
        }
        setUser(auth.user);
        setAuthState("authenticated");
        if (loginResult === "success" && pendingInput) {
          const { routePlaces: savedPlaces, ...savedInput } = pendingInput;
          setInput({ ...EMPTY_INPUT, ...savedInput });
          setRoutePlaces(savedPlaces || { origin: null, destination: null });
        }
      })
      .catch(() => {
        setAuthState("error");
      })
      .finally(() => {
        if (loginResult) window.history.replaceState({}, "", window.location.pathname);
      });
  }, []);

  useEffect(() => {
    const saved = loadSavedPredictionResult();
    if (!saved) return;
    setInput({ ...EMPTY_INPUT, ...saved.input });
    setRoutePlaces(saved.routePlaces || { origin: null, destination: null });
    setApiPredictionResult(saved.result);
    setSelectedStationInfo(saved.selectedStationInfo || null);
    setArrivalWeather(saved.arrivalWeather || null);
    setWeatherRequest(saved.weatherRequest || null);
  }, []);

  useEffect(() => {
    if (!apiPredictionResult) return;
    sessionStorage.setItem(PREDICTION_RESULT_KEY, JSON.stringify({
      input,
      routePlaces,
      result: apiPredictionResult,
      selectedStationInfo,
      arrivalWeather,
      weatherRequest,
    }));
  }, [apiPredictionResult, arrivalWeather, input, routePlaces, selectedStationInfo, weatherRequest]);

  const updateInput = (key, value) => {
    setInput((current) => ({ ...current, [key]: value }));
    if (key === "origin" || key === "destination") {
      setRoutePlaces((current) => ({ ...current, [key]: null }));
      setApiPredictionResult(null);
      setArrivalWeather(null);
      setWeatherRequest(null);
      sessionStorage.removeItem(PREDICTION_RESULT_KEY);
    }
    if (key === "origin" || key === "destination" || key === "travelMode") setTimeConfirmed(false);
  };

  const selectPlace = (key, place) => {
    setInput((current) => ({ ...current, [key]: place.name }));
    setRoutePlaces((current) => ({ ...current, [key]: place }));
  };

  const loadArrivalWeather = async (request) => {
    if (!request) return;
    setWeatherLoading(true);
    try {
      const weather = await fetchArrivalWeather(request);
      setArrivalWeather(adaptArrivalWeather(weather, request.location));
    } catch {
      setArrivalWeather(adaptArrivalWeather({ status: "UNAVAILABLE", hourlyForecasts: [] }, request.location));
    } finally {
      setWeatherLoading(false);
    }
  };

  const selectCandidateWeather = (candidate) => {
    if (!candidate) return;
    const request = {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      arrivalAt: candidate.arrivalAt,
      location: candidate.stationName,
    };
    setWeatherRequest(request);
    void loadArrivalWeather(request);
  };

  const handlePredict = async () => {
    if (authState !== "authenticated") {
      savePendingPrediction(input, routePlaces);
      setLoginPromptOpen(true);
      return;
    }
    setArrivalWeather(null);
    setWeatherRequest(null);

    if (!routePlaces.origin || !routePlaces.destination) {
      setApiPredictionResult(null);
      return;
    }

    setPredictLoading(true);
    try {
      const requestedAt = new Date().toISOString();
      const candidates = await fetchRouteCandidates({
        originLatitude: routePlaces.origin.latitude,
        originLongitude: routePlaces.origin.longitude,
        destinationLatitude: routePlaces.destination.latitude,
        destinationLongitude: routePlaces.destination.longitude,
        travelMode: TRAVEL_MODE_TO_API[input.travelMode] || "WALK",
        requiredBikeCount: input.requiredBikeCount,
      });
      const result = adaptCandidateResponse(candidates, { requestedAt, requiredBikeCount: input.requiredBikeCount });
      if (!result.candidates.length) {
        setApiPredictionResult(null);
        return;
      }
      setApiPredictionResult(result);
      const defaultCandidate = [...result.candidates].sort((a, b) => {
        const probabilityDifference = (b.selectedProbability ?? -1) - (a.selectedProbability ?? -1);
        if (probabilityDifference !== 0) return probabilityDifference;
        const durationDifference = a.durationSeconds - b.durationSeconds;
        if (durationDifference !== 0) return durationDifference;
        return a.distanceMeters - b.distanceMeters;
      })[0];
      setSelectedStationInfo({ stationId: defaultCandidate.stationId, stationName: defaultCandidate.stationName });
      selectCandidateWeather(defaultCandidate);
    } catch {
      setApiPredictionResult(null);
    } finally {
      setPredictLoading(false);
    }
  };

  const handleSelectStation = (stationId) => {
    const candidate = apiPredictionResult?.candidates?.find((item) => item.stationId === stationId);
    if (candidate) {
      setSelectedStationInfo({ stationId: candidate.stationId, stationName: candidate.stationName });
      selectCandidateWeather(candidate);
    }
  };

  const openRidingGuideFor = (candidate) => {
    setSelectedStationInfo({ stationId: candidate.stationId, stationName: candidate.stationName });
    if (candidate.stationId !== selectedStationInfo?.stationId) {
      selectCandidateWeather(candidate);
    }
    setRidingGuideOpen(true);
  };
  const closeRidingGuide = () => setRidingGuideOpen(false);

  useEffect(() => {
    if (!ridingGuideOpen || !selectedStationInfo) return;
    let cancelled = false;
    setGuideAirQualityLoading(true);
    fetchAirQuality(selectedStationInfo.stationId)
      .then((response) => {
        if (!cancelled) setGuideAirQuality(adaptAirQualityResponse(response));
      })
      .catch(() => {
        if (!cancelled) {
          setGuideAirQuality({
            status: "UNAVAILABLE",
            message: null,
            measurementStation: null,
            measuredAt: null,
            collectedAt: null,
            khai: { value: null, grade: null },
            pm10: { value: null, grade: null },
            pm25: { value: null, grade: null },
            o3: { value: null, grade: null },
          });
        }
      })
      .finally(() => {
        if (!cancelled) setGuideAirQualityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ridingGuideOpen, selectedStationInfo]);

  const saveInputBeforeLogin = () => savePendingPrediction(input, routePlaces);

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
      setApiPredictionResult(null);
      setArrivalWeather(null);
      setWeatherRequest(null);
      sessionStorage.removeItem(PREDICTION_RESULT_KEY);
    } catch {
      setAuthState("authenticated");
    }
  };

  if (ridingGuideOpen && selectedStationInfo) {
    const selectedCandidate = apiPredictionResult?.candidates?.find(
      (item) => item.stationId === selectedStationInfo.stationId
    ) || null;
    return (
      <RidingGuidePage
        stationName={selectedStationInfo.stationName}
        candidate={selectedCandidate}
        arrivalWeather={arrivalWeather}
        isWeatherLoading={weatherLoading}
        airQuality={guideAirQuality}
        isAirQualityLoading={guideAirQualityLoading}
        onBack={closeRidingGuide}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <main className="main-shell">
      <AppHeader
        authState={authState}
        onNavigate={onNavigate}
        onBeforeLogin={saveInputBeforeLogin}
        onLogout={handleLogout}
        user={user}
      />

      <MainSearchForm serviceData={serviceData} input={input} onInputChange={updateInput} onPlaceSelect={selectPlace} onPredict={handlePredict} />

      {timeConfirmed && <p className="main-time-notice">예상시간을 <strong>{input.directMinutes || "이동수단 기준"}{input.directMinutes ? "분" : ""}</strong>으로 확인했습니다.</p>}
      {predictLoading && <p className="main-time-notice" role="status">예측 결과를 불러오는 중입니다…</p>}

      {apiPredictionResult ? (
        <section className="main-dashboard">
          <StationRecommendationPanel
            candidates={apiPredictionResult.candidates}
            selectedStationId={selectedStationInfo?.stationId}
            onSelect={handleSelectStation}
            onViewGuide={openRidingGuideFor}
            routeDurationMinutes={timeConfirmed ? input.directMinutes : null}
          />
          <MapRoutePanel
            originText={input.origin}
            destinationText={input.destination}
            travelMode={input.travelMode}
            selectedPlaces={routePlaces}
            onDurationChange={(minutes) => updateInput("directMinutes", minutes)}
            onRouteCalculated={() => setTimeConfirmed(true)}
            fallbackImage={routeMap}
            canViewStations={authState === "authenticated"}
          />
          <PredictionSummaryPanel
            candidates={apiPredictionResult.candidates}
            selectedStationId={selectedStationInfo?.stationId}
            arrivalWeather={arrivalWeather}
            weatherLoading={weatherLoading}
            onRetryWeather={() => void loadArrivalWeather(weatherRequest)}
          />
        </section>
      ) : (
        <section className="main-dashboard main-dashboard-empty">
          <MapRoutePanel
            originText={input.origin}
            destinationText={input.destination}
            travelMode={input.travelMode}
            selectedPlaces={routePlaces}
            onDurationChange={(minutes) => updateInput("directMinutes", minutes)}
            onRouteCalculated={() => setTimeConfirmed(true)}
            fallbackImage={routeMap}
            canViewStations={authState === "authenticated"}
          />
        </section>
      )}

      {loginPromptOpen && <LoginPromptModal notice={serviceData.loginNotice} onClose={() => setLoginPromptOpen(false)} onBeforeLogin={saveInputBeforeLogin} />}
    </main>
  );
}
