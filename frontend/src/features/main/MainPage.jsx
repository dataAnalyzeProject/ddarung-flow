import { useEffect, useState } from "react";
import "./MainPage.css";
import { serviceData } from "./mainPageData";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";
import { fetchRouteCandidates } from "../map/candidatesApi";
import { fetchStationDetail } from "../map/stationApi";
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
import PremiumGuideAccessPanel from "../premium/PremiumGuideAccessPanel";
import { confirmPayment, fetchSubscription, startCheckout } from "../premium/subscriptionApi";
import { requestTossCheckout } from "../premium/tossCheckout";
import { saveFavorite, saveSavedRoute } from "../archive/archiveApi";

const EMPTY_INPUT = {
  origin: "",
  destination: "",
  travelMode: serviceData.selectedMode,
  directMinutes: 15,
  requiredBikeCount: 1,
};

const TRAVEL_MODE_TO_API = { "도보": "WALK", "대중교통": "PUBLIC_TRANSIT" };
const PREDICTION_RESULT_KEY = "ddarung.mainPredictionResult.v1";
const PENDING_GUIDE_KEY = "ddarung.pendingGuideOpen.v1";
const PAYMENT_FAILURE_MESSAGE_KEY = "ddarung.paymentFailureMessage.v1";
const PAYMENT_PROCESSING_KEY = "ddarung.paymentProcessing.v1";
const SAVED_ROUTE_RESTORE_KEY = "ddarung.savedRouteRestore.v1";
const API_TRAVEL_MODE_TO_LABEL = { WALK: "도보", PUBLIC_TRANSIT: "대중교통" };

function paymentFailureMessage(code) {
  return code === "PAY_PROCESS_CANCELED"
    ? "결제가 취소되었습니다. 다시 시도해 주세요."
    : "결제를 완료하지 못했습니다. 다시 시도해 주세요.";
}

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
  const [emptyCandidateResult, setEmptyCandidateResult] = useState(false);
  const [predictLoading, setPredictLoading] = useState(false);
  const [selectedStationInfo, setSelectedStationInfo] = useState(null);
  const [ridingGuideOpen, setRidingGuideOpen] = useState(false);
  const [guideAccessState, setGuideAccessState] = useState(null);
  const [guideAccessLoading, setGuideAccessLoading] = useState(false);
  const [guideAccessError, setGuideAccessError] = useState(null);
  const [guideAirQuality, setGuideAirQuality] = useState(null);
  const [guideAirQualityLoading, setGuideAirQualityLoading] = useState(false);
  const [arrivalWeather, setArrivalWeather] = useState(null);
  const [weatherRequest, setWeatherRequest] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [saveRouteState, setSaveRouteState] = useState("idle");
  const [favoriteStationIds, setFavoriteStationIds] = useState([]);
  const [favoriteNotice, setFavoriteNotice] = useState("");

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
          setTimeConfirmed(Number(savedInput.directMinutes) > 0);
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
    const query = new URLSearchParams(window.location.search);
    if (query.get("payment") === "processing") {
      sessionStorage.setItem(PENDING_GUIDE_KEY, "1");
      sessionStorage.setItem(PAYMENT_PROCESSING_KEY, "1");
      const paymentKey = query.get("paymentKey");
      const orderId = query.get("orderId");
      const amount = Number(query.get("amount"));
      window.history.replaceState({}, "", window.location.pathname);
      if (!paymentKey || !orderId || !Number.isInteger(amount)) {
        sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
        sessionStorage.setItem(PAYMENT_FAILURE_MESSAGE_KEY, "결제를 확인하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      confirmPayment({ paymentKey, orderId, amount })
        .then(() => {
          sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
          setGuideAccessState("ACTIVE");
        })
        .catch(() => {
          sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
          sessionStorage.setItem(PAYMENT_FAILURE_MESSAGE_KEY, "결제를 확인하지 못했습니다. 다시 시도해 주세요.");
        });
      return;
    }
    if (query.get("payment") === "failed") {
      sessionStorage.setItem(PENDING_GUIDE_KEY, "1");
      sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
      sessionStorage.setItem(PAYMENT_FAILURE_MESSAGE_KEY, paymentFailureMessage(query.get("code")));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (
      authState === "authenticated" &&
      apiPredictionResult &&
      selectedStationInfo &&
      sessionStorage.getItem(PENDING_GUIDE_KEY) === "1"
    ) {
      sessionStorage.removeItem(PENDING_GUIDE_KEY);
      setGuideAccessError(null);
      setRidingGuideOpen(true);
      setGuideAccessLoading(true);
      let cancelled = false;
      fetchSubscription()
        .then((subscription) => {
          if (!cancelled) {
            const paymentProcessing = sessionStorage.getItem(PAYMENT_PROCESSING_KEY) === "1";
            if (subscription.status === "ACTIVE") sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
            setGuideAccessState(subscription.status === "ACTIVE" ? "ACTIVE" : paymentProcessing ? "PROCESSING" : subscription.status === "EXPIRED" ? "EXPIRED" : "FREE");
            const paymentFailure = sessionStorage.getItem(PAYMENT_FAILURE_MESSAGE_KEY);
            if (paymentFailure) {
              sessionStorage.removeItem(PAYMENT_FAILURE_MESSAGE_KEY);
              setGuideAccessError(paymentFailure);
            }
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setGuideAccessState("FREE");
            setGuideAccessError(error.message === "AUTH_REQUIRED" ? "로그인 후 구독 상태를 확인해 주세요." : "구독 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
          }
        })
        .finally(() => {
          if (!cancelled) setGuideAccessLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [apiPredictionResult, authState, selectedStationInfo]);

  useEffect(() => {
    if (!ridingGuideOpen || guideAccessState !== "PROCESSING") return undefined;
    const intervalId = window.setInterval(() => {
      fetchSubscription()
        .then((subscription) => {
          if (subscription.status === "ACTIVE") {
            sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
            setGuideAccessState("ACTIVE");
          }
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [guideAccessState, ridingGuideOpen]);

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
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVED_ROUTE_RESTORE_KEY));
      if (!saved || saved.kind !== "ROUTE") return;
      setInput((current) => ({ ...current, origin: saved.originName, destination: saved.destinationName, travelMode: API_TRAVEL_MODE_TO_LABEL[saved.travelMode] || "도보", requiredBikeCount: saved.requiredBikeCount }));
      setRoutePlaces({ origin: { name: saved.originName, latitude: Number(saved.originLatitude), longitude: Number(saved.originLongitude) }, destination: { name: saved.destinationName, latitude: Number(saved.destinationLatitude), longitude: Number(saved.destinationLongitude) } });
      setTimeConfirmed(false);
    } catch {
      // A malformed local restore entry is discarded without changing the current search.
    } finally {
      sessionStorage.removeItem(SAVED_ROUTE_RESTORE_KEY);
    }
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
    setEmptyCandidateResult(false);
    setInput((current) => ({
      ...current,
      [key]: value,
      ...((key === "origin" || key === "destination" || key === "travelMode") && { directMinutes: null }),
    }));
    if (key === "origin" || key === "destination") {
      setRoutePlaces((current) => ({ ...current, [key]: null }));
      setApiPredictionResult(null);
      setArrivalWeather(null);
      setWeatherRequest(null);
      sessionStorage.removeItem(PREDICTION_RESULT_KEY);
    }
    if (key === "origin" || key === "destination" || key === "travelMode") setTimeConfirmed(false);
  };

  const updateRouteDuration = (minutes) => {
    updateInput("directMinutes", minutes);
    if (minutes == null) setTimeConfirmed(false);
  };

  const selectPlace = (key, place) => {
    setEmptyCandidateResult(false);
    setInput((current) => ({ ...current, [key]: place.name, directMinutes: null }));
    setRoutePlaces((current) => ({ ...current, [key]: place }));
    setTimeConfirmed(false);
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
    setEmptyCandidateResult(false);

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
        setSelectedStationInfo(null);
        setEmptyCandidateResult(true);
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
    } catch (error) {
      if (error?.message === "AUTH_REQUIRED") {
        savePendingPrediction(input, routePlaces);
        window.location.assign("/login?login=expired");
        return;
      }
      setApiPredictionResult(null);
      setEmptyCandidateResult(false);
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

  const saveFavoriteStation = async (candidate) => {
    if (!window.confirm("이 대여소를 보관함에 저장할까요?")) return;
    try {
      const station = await fetchStationDetail(candidate.stationId);
      const favoriteStationId = Number(station.stationNumber);
      if (!Number.isSafeInteger(favoriteStationId)) throw new Error("INVALID_STATION_NUMBER");
      await saveFavorite({ stationId: favoriteStationId, stationName: candidate.stationName });
      setFavoriteStationIds((current) => current.includes(String(candidate.stationId)) ? current : [...current, String(candidate.stationId)]);
      setFavoriteNotice(`${candidate.stationName} 저장이 완료되었습니다. 보관함의 저장 대여소에서 확인하세요.`);
    } catch (error) {
      setFavoriteNotice(error.code === "FAVORITE_LIMIT_REACHED" ? "저장 대여소는 최대 20개까지 등록할 수 있습니다." : "대여소를 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const saveCurrentRoute = async () => {
    if (!routePlaces.origin || !routePlaces.destination) return;
    setSaveRouteState("saving");
    try {
      await saveSavedRoute({ kind: "ROUTE", originName: routePlaces.origin.name, originLatitude: routePlaces.origin.latitude, originLongitude: routePlaces.origin.longitude, destinationName: routePlaces.destination.name, destinationLatitude: routePlaces.destination.latitude, destinationLongitude: routePlaces.destination.longitude, stationId: null, travelMode: TRAVEL_MODE_TO_API[input.travelMode] || "WALK", directMinutes: null, requiredBikeCount: input.requiredBikeCount });
      setSaveRouteState("saved");
    } catch (error) {
      setSaveRouteState(error.code === "SAVED_ROUTE_LIMIT_REACHED" ? "limit" : "error");
    }
  };

  const openRidingGuideFor = async (candidate) => {
    setSelectedStationInfo({ stationId: candidate.stationId, stationName: candidate.stationName });
    if (candidate.stationId !== selectedStationInfo?.stationId) {
      selectCandidateWeather(candidate);
    }
    setGuideAccessError(null);
    setRidingGuideOpen(true);
    if (authState !== "authenticated") {
      setGuideAccessState("ANONYMOUS");
      return;
    }

    setGuideAccessLoading(true);
    try {
      const subscription = await fetchSubscription();
      setGuideAccessState(subscription.status === "ACTIVE" ? "ACTIVE" : subscription.status === "EXPIRED" ? "EXPIRED" : "FREE");
    } catch (error) {
      setGuideAccessState("FREE");
      setGuideAccessError(error.message === "AUTH_REQUIRED" ? "로그인 후 구독 상태를 확인해 주세요." : "구독 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setGuideAccessLoading(false);
    }
  };
  const closeRidingGuide = () => {
    setRidingGuideOpen(false);
    setGuideAccessState(null);
    setGuideAccessError(null);
  };

  const handleGuideLogin = () => {
    sessionStorage.setItem(PENDING_GUIDE_KEY, "1");
    saveInputBeforeLogin();
    window.location.assign("/login");
  };

  const handleSelectPlan = async ({ planCode }) => {
    setGuideAccessError(null);
    setGuideAccessState("PROCESSING");
    sessionStorage.setItem(PENDING_GUIDE_KEY, "1");
    try {
      const checkout = await startCheckout(planCode);
      await requestTossCheckout(checkout, {
        onCancel: () => {
          sessionStorage.removeItem(PENDING_GUIDE_KEY);
          sessionStorage.removeItem(PAYMENT_PROCESSING_KEY);
          setGuideAccessState("FREE");
          setGuideAccessError("결제가 취소되었습니다. 다시 시도해 주세요.");
        },
      });
    } catch (error) {
      sessionStorage.removeItem(PENDING_GUIDE_KEY);
      setGuideAccessState("FREE");
      setGuideAccessError(error.message === "PAYMENT_NOT_ENABLED" ? "현재 결제를 사용할 수 없습니다." : "결제 요청을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  useEffect(() => {
    if (!ridingGuideOpen || !selectedStationInfo || guideAccessState !== "ACTIVE") return;
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
  }, [guideAccessState, ridingGuideOpen, selectedStationInfo]);

  const saveInputBeforeLogin = () => savePendingPrediction(input, routePlaces);

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
      setApiPredictionResult(null);
      setEmptyCandidateResult(false);
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
    if (guideAccessLoading || !guideAccessState) {
      return <main className="main-shell"><p className="main-time-notice" role="status">구독 상태를 확인하는 중입니다…</p></main>;
    }
    if (guideAccessState !== "ACTIVE") {
      return (
        <main className="main-shell">
          <PremiumGuideAccessPanel
            accessState={guideAccessState}
            onLogin={handleGuideLogin}
            onSelectPlan={handleSelectPlan}
          />
          {guideAccessState === "PROCESSING" && <p className="main-time-notice" role="status">결제 확인 요청이 준비되었습니다. sandbox 인수 환경에서 완료를 확인합니다.</p>}
          {guideAccessError && <p className="main-time-notice" role="alert">{guideAccessError}</p>}
          <button type="button" onClick={closeRidingGuide}>대여 예측으로 돌아가기</button>
        </main>
      );
    }
    return (
      <RidingGuidePage
        stationName={selectedStationInfo.stationName}
        candidate={selectedCandidate}
        arrivalWeather={arrivalWeather}
        isWeatherLoading={weatherLoading}
        airQuality={guideAirQuality}
        isAirQualityLoading={guideAirQualityLoading}
        authState={authState}
        user={user}
        onLogout={handleLogout}
        onBack={closeRidingGuide}
        onNavigate={onNavigate}
      />
    );
  }

  const mapRoutePanelProps = {
    originText: input.origin,
    destinationText: input.destination,
    travelMode: input.travelMode,
    selectedPlaces: routePlaces,
    onDurationChange: updateRouteDuration,
    onRouteCalculated: () => setTimeConfirmed(true),
    fallbackImage: routeMap,
    canViewStations: authState === "authenticated",
    onStationDetail: (stationId) => onNavigate?.("station", stationId),
  };

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
      {favoriteNotice && <p className="main-time-notice" role="status">{favoriteNotice}</p>}
      {predictLoading && <p className="main-time-notice" role="status">예측 결과를 불러오는 중입니다…</p>}
      {emptyCandidateResult && (
        <section className="main-empty-result" role="status">
          <strong>주변에 추천할 대여소를 찾지 못했어요.</strong>
          <span>목적지나 이동수단을 바꿔 다시 확인해 주세요.</span>
        </section>
      )}

      {apiPredictionResult ? (
        <section className="main-dashboard">
          <StationRecommendationPanel
            candidates={apiPredictionResult.candidates}
            selectedStationId={selectedStationInfo?.stationId}
            onSelect={handleSelectStation}
            onViewGuide={openRidingGuideFor}
            onViewStation={(stationId) => onNavigate?.("station", stationId)}
            onFavorite={saveFavoriteStation}
            favoriteStationIds={favoriteStationIds}
            routeDurationMinutes={timeConfirmed ? input.directMinutes : null}
          />
          <MapRoutePanel key="map-route-panel" {...mapRoutePanelProps} />
          <PredictionSummaryPanel
            candidates={apiPredictionResult.candidates}
            selectedStationId={selectedStationInfo?.stationId}
            arrivalWeather={arrivalWeather}
            weatherLoading={weatherLoading}
            onRetryWeather={() => void loadArrivalWeather(weatherRequest)}
          />
          <div className="main-time-notice"><button type="button" onClick={() => void saveCurrentRoute()} disabled={saveRouteState === "saving"}>현재 검색 저장</button>{saveRouteState === "saved" && <span> 저장했습니다.</span>}{saveRouteState === "limit" && <span> 저장 경로는 최대 10개입니다.</span>}{saveRouteState === "error" && <span> 저장하지 못했습니다. 다시 시도해 주세요.</span>}</div>
        </section>
      ) : (
        <section className="main-dashboard main-dashboard-empty">
          <MapRoutePanel key="map-route-panel" {...mapRoutePanelProps} />
        </section>
      )}

      {loginPromptOpen && <LoginPromptModal notice={serviceData.loginNotice} onClose={() => setLoginPromptOpen(false)} onBeforeLogin={saveInputBeforeLogin} />}
    </main>
  );
}
