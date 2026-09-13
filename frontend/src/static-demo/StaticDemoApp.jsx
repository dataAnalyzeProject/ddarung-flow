import { useEffect, useState } from "react";
import OpeningPage from "../features/consumer-r2/entry/OpeningPage";
import ConsumerMainPage from "../features/consumer-r2/main/ConsumerMainPage";
import StationDetailPage from "../features/consumer-r2/station/StationDetailPage";
import ConsumerRidingGuidePage from "../features/consumer-r2/guide/ConsumerRidingGuidePage";
import { ConsumerJourneyPlannerPage, ConsumerJourneyPlanResultPage } from "../features/consumer-r2/journey";
import AdminV2PreviewApp from "../features/admin-v2/shell/AdminV2PreviewApp";
import { MapShell } from "../features/consumer-r2/shared";
import routeMap from "../assets/main/route-map.png";
import { demoUser, guideServices, journeyAdapter, journeyDecision, mainServices, recheckAdapter, stationAdapter } from "./fixtures";
import "./static-demo.css";

const ROUTES = new Set(["home", "main", "station", "guide", "planner", "journey-result", "admin"]);
const QUICK_LINKS = [["home", "홈"], ["main", "예측"], ["station", "대여소"], ["guide", "가이드"], ["planner", "AI 플래너"], ["admin", "관리자"]];

function routeFromHash() {
  const value = window.location.hash.replace(/^#\/?demo\/?/, "").split(/[/?]/)[0];
  return ROUTES.has(value) ? value : "home";
}

function StaticMap({ variant = "route" }) {
  const label = variant === "station" ? "대여소 위치 정적 지도" : variant === "journey" ? "AI 여정 정적 지도" : "선택한 대여소까지의 정적 경로 지도";
  if (variant === "station") return <section className="cr22-station__map" aria-label={label}><img className="static-demo-map__image" src={routeMap} alt="성수역과 서울숲 주변을 표시한 저장된 지도" /><span className="cr22-station__map-caption">위치 정보 · 저장된 화면</span></section>;
  if (variant === "journey") return <MapShell ariaLabel={label} footer={<p className="cr22-journey__map-note">정적 데모에서는 저장된 지도 자산을 표시합니다.</p>}><img className="static-demo-map__image" src={routeMap} alt="성수역에서 서울숲까지의 저장된 여정 지도" /></MapShell>;
  return <div className="cr293-map" aria-label={label}><img className="static-demo-map__image" src={routeMap} alt="강남역에서 성수역 대여소까지의 저장된 경로 지도" /><p className="cr293-map__notice" role="status">정적 지도 · 외부 지도 API를 호출하지 않습니다.</p></div>;
}

export default function StaticDemoApp() {
  const [route, setRoute] = useState(routeFromHash);
  const [decision, setDecision] = useState(journeyDecision);
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (target) => {
    const aliases = { ride: "main", journey: "planner", archive: "home", mypage: "home", qna: "home", login: "home" };
    const next = aliases[target] || target;
    window.location.hash = `demo/${ROUTES.has(next) ? next : "home"}`;
  };

  let page;
  if (route === "main") page = <ConsumerMainPage mapRenderer={StaticMap} onNavigate={navigate} onOpenGuide={() => navigate("guide")} onOpenStation={() => navigate("station")} onOpenRide={() => navigate("station")} services={mainServices} />;
  else if (route === "station") page = <StationDetailPage adapter={stationAdapter} authState="authenticated" mapRenderer={StaticMap} onNavigate={navigate} stationId="ST-DEMO-1" user={demoUser} />;
  else if (route === "guide") page = <ConsumerRidingGuidePage authState="authenticated" guideContext={{ minutesAhead: 38, requiredBikeCount: 1 }} onNavigate={navigate} returnRoute="main" services={guideServices} stationId="ST-DEMO-1" user={demoUser} />;
  else if (route === "planner") page = <ConsumerJourneyPlannerPage adapter={journeyAdapter} authState="authenticated" onNavigate={navigate} onResult={setDecision} user={demoUser} />;
  else if (route === "journey-result") page = <ConsumerJourneyPlanResultPage adapter={journeyAdapter} authState="authenticated" decisionId={decision.decisionId} initialDecision={decision} mapRenderer={StaticMap} onNavigate={navigate} recheckAdapter={recheckAdapter} user={demoUser} />;
  else if (route === "admin") page = <AdminV2PreviewApp pathname="/admin-v2-preview/ops" search="?fixture=OPS_VIEWER&opsFixture=SUCCESS" />;
  else page = <OpeningPage authState="authenticated" onNavigate={navigate} onStart={() => navigate("main")} user={demoUser} />;

  return <div className="static-demo-shell">
    <aside className="static-demo-boundary" aria-label="정적 데모 안내">
      <strong>Portfolio Demo · Sample Data · Backend Offline</strong>
      <nav aria-label="정적 데모 화면 바로가기">{QUICK_LINKS.map(([target, label]) => <button key={target} type="button" aria-current={route === target ? "page" : undefined} onClick={() => navigate(target)}>{label}</button>)}</nav>
    </aside>
    <div className="static-demo-page">{page}</div>
  </div>;
}
