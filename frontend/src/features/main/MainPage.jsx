import { useEffect, useMemo, useState } from "react";
import "./MainPage.css";
import { serviceData, stations } from "./mainPageData";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";
import { fetchRouteCandidates } from "../map/candidatesApi";
import routeMap from "../../assets/main/route-map.png";
import AppHeader from "../../shared/AppHeader";
import RidingGuidePage from "../riding-guide/RidingGuidePage";
import MapRoutePanel from "../map/MapRoutePanel";
import LoginPromptModal from "./components/LoginPromptModal";
import MainSearchForm from "./components/MainSearchForm";
import PredictionSummaryPanel from "./components/PredictionSummaryPanel";
import StationRecommendationPanel from "./components/StationRecommendationPanel";
import PredictionResults from "../prediction-results/PredictionResults";
import { adaptCandidateResponse } from "../prediction-results/adaptCandidateResponse";
import { stationMeta } from "./data/mainPageFixture";

const EMPTY_INPUT = {
  origin: "",
  destination: "",
  travelMode: serviceData.selectedMode,
  directMinutes: 15,
  requiredBikeCount: 1,
};

const TRAVEL_MODE_TO_API = { "도보": "WALK", "대중교통": "PUBLIC_TRANSIT" };


export default function MainPage({ onNavigate }) {
  const [authState, setAuthState] = useState("anonymous");
  const [user, setUser] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [routePlaces, setRoutePlaces] = useState({ origin: null, destination: null });
  const [view, setView] = useState("idle");
  const [authNotice, setAuthNotice] = useState("");
  const [selectedStation, setSelectedStation] = useState(stations[0].id);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [guideStation, setGuideStation] = useState(null);
  const [predictionMinutes, setPredictionMinutes] = useState(null);
  const [apiPredictionResult, setApiPredictionResult] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState("");
  const predictionVisible = true;

  useEffect(() => {
    const loginResult = new URLSearchParams(window.location.search).get("login");
    const pendingInput = loadPendingPrediction();

    if (loginResult === "failed") setAuthNotice("로그인에 실패했습니다. 다시 시도해 주세요.");
    if (loginResult === "cancelled") setAuthNotice("로그인이 취소되었습니다.");

    getCurrentUser()
      .then((auth) => {
        if (!auth.authenticated) {
          setAuthState("anonymous");
          return;
        }
        setUser(auth.user);
        setAuthState("authenticated");
        setView("result");
        if (loginResult === "success" && pendingInput) {
          setInput({ ...EMPTY_INPUT, ...pendingInput });
          setView("restored");
        }
      })
      .catch(() => {
        setAuthState("error");
      })
      .finally(() => {
        if (loginResult) window.history.replaceState({}, "", window.location.pathname);
      });
  }, []);

  const selectedStationName = useMemo(
    () => stations.find((station) => station.id === selectedStation)?.name,
    [selectedStation]
  );

  const updateInput = (key, value) => {
    setInput((current) => ({ ...current, [key]: value }));
    if (key === "origin" || key === "destination") {
      setRoutePlaces((current) => ({ ...current, [key]: null }));
      setApiPredictionResult(null);
    }
    if (key === "directMinutes") setTimeConfirmed(false);
  };

  const selectPlace = (key, place) => {
    setInput((current) => ({ ...current, [key]: place.name }));
    setRoutePlaces((current) => ({ ...current, [key]: place }));
  };

  const handlePredict = async () => {
    if (authState !== "authenticated") {
      savePendingPrediction(input);
      setLoginPromptOpen(true);
      return;
    }
    setPredictionMinutes(input.directMinutes);
    setView("result");
    setPredictError("");

    // 실제 좌표(자동완성으로 선택한 출발지·목적지)가 있을 때만 실제 API를 호출한다.
    // 자유 입력 텍스트만 있고 좌표가 없으면 기존 화면 확인용 예시 결과를 그대로 보여준다.
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
      setApiPredictionResult(adaptCandidateResponse(candidates, { requestedAt, requiredBikeCount: input.requiredBikeCount }));
    } catch (error) {
      setApiPredictionResult(null);
      setPredictError(
        error.message === "AUTH_REQUIRED"
          ? "로그인이 필요합니다. 다시 로그인해 주세요."
          : "예측 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setPredictLoading(false);
    }
  };

  const saveInputBeforeLogin = () => savePendingPrediction(input);

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
      setView("idle");
      setAuthNotice("로그아웃되었습니다.");
    } catch {
      setAuthState("authenticated");
      setAuthNotice("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  if (guideStation) {
    return (
      <RidingGuidePage
        stationName={guideStation.name}
        onBack={() => setGuideStation(null)}
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

      <MainSearchForm serviceData={serviceData} input={input} onInputChange={updateInput} onPlaceSelect={selectPlace} onConfirmTime={() => setTimeConfirmed(true)} onPredict={handlePredict} />

      {timeConfirmed && <p className="main-time-notice">예상시간을 <strong>{input.directMinutes || "이동수단 기준"}{input.directMinutes ? "분" : ""}</strong>으로 확인했습니다.</p>}
      {authNotice && <section className="main-feedback error"><b>로그인 안내</b><p>{authNotice}</p><button type="button" onClick={() => setAuthNotice("")}>닫기</button></section>}
      {view === "restored" && <section className="main-feedback restored"><b>입력값을 불러왔습니다</b><p>이전 입력값을 확인한 뒤 다시 예측해 주세요.</p><button type="button" onClick={handlePredict}>{serviceData.retryButton}</button></section>}
      {predictLoading && <p className="main-time-notice" role="status">실제 예측 결과를 불러오는 중입니다…</p>}
      {predictError && <section className="main-feedback error"><b>예측 오류</b><p>{predictError}</p><button type="button" onClick={() => setPredictError("")}>닫기</button></section>}

      {apiPredictionResult ? (
        <PredictionResults
          result={apiPredictionResult}
          onEditInput={() => setApiPredictionResult(null)}
        />
      ) : (
        <section className="main-dashboard">
          {predictionVisible && <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}><b>{serviceData.resultTitle}</b><i>화면 확인용 예시 결과 · 대여소 3곳</i></span>}
          <StationRecommendationPanel stations={stations} metadata={stationMeta} selectedStation={selectedStation} predictionMinutes={predictionMinutes} predictionVisible={predictionVisible} onSelect={setSelectedStation} onDetails={(station) => { setSelectedStation(station.id); setGuideStation(station); }} />
          <MapRoutePanel
            originText={input.origin}
            destinationText={input.destination}
            travelMode={input.travelMode}
            selectedPlaces={routePlaces}
            onDurationChange={(minutes) => updateInput("directMinutes", minutes)}
            fallbackImage={routeMap}
            canViewStations={authState === "authenticated"}
          />
          <PredictionSummaryPanel stationName={selectedStationName} predictionVisible={predictionVisible} />
        </section>
      )}

      {loginPromptOpen && <LoginPromptModal notice={serviceData.loginNotice} onClose={() => setLoginPromptOpen(false)} onBeforeLogin={saveInputBeforeLogin} />}
    </main>
  );
}
