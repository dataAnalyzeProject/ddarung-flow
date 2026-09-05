import { useEffect, useMemo, useState } from "react";
import emptyScheduleIllustration from "../../../assets/consumer-r2/guide/cr22-guide-empty-ai-calendar-v1.webp";
import { consumerGuideAdapter } from "../adapters/guide/index.js";
import ConsumerAppHeader from "../shared/ConsumerAppHeader.jsx";
import { ConsumerButton, StatusBadge } from "../shared/ConsumerControls.jsx";
import ConsumerIcon from "../shared/ConsumerIcon.jsx";
import { ConsumerContainer, ConsumerR2Theme } from "../shared/ConsumerR2Layout.jsx";
import "./guide.css";

const AVAILABILITY_LABELS = { HIGH: "높음", MEDIUM: "중간", LOW: "낮음" };
const INVENTORY_LABELS = { NORMAL: "정상 수집", DELAYED: "지연 데이터", MISSING: "확인 불가", UNAVAILABLE: "확인 불가" };
const SKY_LABELS = { CLEAR: "맑음", SUNNY: "맑음", CLOUDY: "흐림", OVERCAST: "흐림" };
const AIR_LABELS = { GOOD: "좋음", MODERATE: "보통", BAD: "나쁨", VERY_BAD: "매우 나쁨" };

function valueOrUnavailable(value, formatter = (item) => item) {
  return value === null || value === undefined || value === "" ? "확인 불가" : formatter(value);
}

function formatPercent(value) {
  return valueOrUnavailable(value, (number) => new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 0 }).format(number));
}

function formatCount(value) {
  return valueOrUnavailable(value, (number) => `${new Intl.NumberFormat("ko-KR").format(number)}대`);
}

function formatTemperature(value) {
  return valueOrUnavailable(value, (number) => `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(number)}°C`);
}

function formatDistance(value) {
  return valueOrUnavailable(value, (number) => number >= 1000
    ? `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(number / 1000)}km`
    : `${new Intl.NumberFormat("ko-KR").format(number)}m`);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

// The mockup shows the arrival probability as a ring rather than an icon. The
// ring draws the number the server already sent; when that number is missing
// the ring is empty and the value still reads 확인 불가.
function ProbabilityRing({ ratio }) {
  const filled = typeof ratio === "number" && Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : null;
  const circumference = 2 * Math.PI * 15.5;
  return (
    <span className="cr22-guide__fact-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle className="cr22-guide__fact-ring-track" cx="18" cy="18" r="15.5" />
        {filled === null ? null : <circle className="cr22-guide__fact-ring-value" cx="18" cy="18" r="15.5" strokeDasharray={`${(filled * circumference).toFixed(2)} ${circumference.toFixed(2)}`} />}
      </svg>
    </span>
  );
}

function FactItem({ icon, label, state = "UNAVAILABLE", value, detail, ring }) {
  return (
    <div className={`cr22-guide__fact cr22-guide__fact--${state.toLowerCase()}`}>
      {ring === undefined ? <span className="cr22-guide__fact-icon" aria-hidden="true"><ConsumerIcon name={icon} size={24} /></span> : <ProbabilityRing ratio={ring} />}
      <div className="cr22-guide__fact-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function FactualOverview({ guide }) {
  const { rental, weather, airQuality } = guide.facts;
  const availability = AVAILABILITY_LABELS[rental?.text.availabilityLevel] || "확인 불가";
  const sky = SKY_LABELS[weather?.text.skyStatus] || weather?.text.skyStatus || "확인 불가";
  const airGrade = AIR_LABELS[airQuality?.text.khaiGrade] || airQuality?.text.khaiGrade || "확인 불가";

  return (
    <section className="cr22-guide__facts" aria-labelledby="guide-facts-title">
      <h2 className="cr22-sr-only" id="guide-facts-title">현재 라이딩 정보</h2>
      <FactItem icon="bike" label="도착 시점 대여 가능성" state={rental?.status} value={formatPercent(rental?.numeric.rentalProbability)} detail={availability} ring={rental?.numeric.rentalProbability ?? null} />
      <FactItem icon="bike" label="현재 자전거" state={rental?.status} value={formatCount(rental?.numeric.availableBikeCount)} detail={INVENTORY_LABELS[rental?.text.inventoryStatus] || "상태 확인 불가"} />
      <FactItem icon="info" label="도착 시점 기온" state={weather?.status} value={formatTemperature(weather?.numeric.temperatureCelsius)} detail={sky} />
      <FactItem icon="info" label="현재 대기질" state={airQuality?.status} value={airGrade} detail={airQuality?.numeric.pm25 === null || airQuality?.numeric.pm25 === undefined ? "미세먼지 확인 불가" : `미세먼지 ${formatNumber(airQuality.numeric.pm25)}㎍/㎥`} />
      <p className="cr22-guide__facts-note"><ConsumerIcon name="info" size={17} /> 이 정보는 서버가 수집한 대여 예측·날씨·대기질 근거이며, AI가 새로 만든 값이 아닙니다.</p>
    </section>
  );
}

function AiSummary({ guide }) {
  if (guide.aiStatus !== "AVAILABLE") {
    return (
      <section className="cr22-guide__panel cr22-guide__ai-unavailable" aria-labelledby="guide-ai-title" role="status">
        <header><span aria-hidden="true"><ConsumerIcon name="info" /></span><h2 id="guide-ai-title">AI 요약을 지금 제공할 수 없습니다</h2></header>
        <p>AI 설명은 숨겼습니다. 위의 대여 예측·날씨·대기질 정보는 계속 확인할 수 있으며, 잠시 후 페이지를 다시 열어 재시도할 수 있습니다.</p>
      </section>
    );
  }

  return (
    <section className="cr22-guide__panel cr22-guide__summary" aria-labelledby="guide-ai-title">
      <header><span aria-hidden="true"><ConsumerIcon name="plan" /></span><h2 id="guide-ai-title">Premium AI 라이딩 요약</h2></header>
      <p className="cr22-guide__summary-lead">{guide.ai.summary}</p>
      {guide.ai.rationale ? <div className="cr22-guide__rationale"><strong>추천 근거</strong><p>{guide.ai.rationale}</p></div> : null}
      <aside className="cr22-guide__truth-note"><ConsumerIcon name="info" size={18} /><p>AI 설명은 서버에서 검증한 문장만 표시합니다. 확률·재고·날씨 값은 위의 사실 정보에서 확인하세요.</p></aside>
    </section>
  );
}

function PlaceList({ guide }) {
  const aiPlaces = guide.ai.itinerary;
  const factualPlaces = guide.facts.places.map((place) => ({
    poiId: place.id,
    name: place.text.name || "장소 이름 확인 불가",
    category: place.text.category || null,
    address: place.text.address || null,
    distanceMeters: typeof place.numeric.distanceMeters === "number" ? place.numeric.distanceMeters : null,
    stayMinutes: null,
    rationale: null,
  }));
  const places = guide.aiStatus === "AVAILABLE" ? aiPlaces : factualPlaces;

  return (
    <section className="cr22-guide__panel cr22-guide__places" aria-labelledby="guide-places-title">
      <header>
        <span aria-hidden="true"><ConsumerIcon name="mapPin" /></span>
        <div><h2 id="guide-places-title">{guide.aiStatus === "AVAILABLE" ? "실제 장소 기반 AI 추천 이유" : "확인된 주변 장소"}</h2><p>서버가 받은 장소 정보만 표시하며, 이미지나 경로는 만들지 않습니다.</p></div>
      </header>
      {places.length ? <ol>{places.slice(0, 3).map((place) => (
        <li key={place.poiId}>
          <span className="cr22-guide__place-marker" aria-hidden="true"><ConsumerIcon name="mapPin" size={19} /></span>
          <div className="cr22-guide__place-copy">
            <div><h3>{place.name}</h3>{place.category ? <StatusBadge tone="positive">{place.category}</StatusBadge> : null}</div>
            <p className="cr22-guide__place-meta">{[place.address, place.distanceMeters === null ? null : formatDistance(place.distanceMeters)].filter(Boolean).join(" · ") || "상세 정보 확인 불가"}</p>
            {place.rationale ? <p className="cr22-guide__place-rationale">{place.rationale}</p> : null}
          </div>
        </li>
      ))}</ol> : <p className="cr22-guide__empty-copy">현재 확인된 주변 장소가 없습니다.</p>}
    </section>
  );
}

function SchedulePanel({ guide, journeyDecisionId, onNavigate }) {
  if (!guide.hasExistingPlan) {
    return (
      <aside className="cr22-guide__schedule" aria-labelledby="guide-schedule-title">
        <header><span aria-hidden="true"><ConsumerIcon name="plan" /></span><div><h2 id="guide-schedule-title">아직 전체 일정이 없습니다</h2><p>전체 일정은 AI 플래너에서 별도로 만들 수 있습니다.</p></div></header>
        <img src={emptyScheduleIllustration} alt="" width="1200" height="900" loading="lazy" />
        <ConsumerButton block disabled={!onNavigate} icon={<ConsumerIcon name="arrowRight" />} iconPosition="end" onClick={() => onNavigate?.("planner")}>{guide.scheduleCta}</ConsumerButton>
        <p className="cr22-guide__schedule-note">이 페이지에서는 독립적인 라이딩 일정을 생성하지 않습니다.</p>
      </aside>
    );
  }

  return (
    <aside className="cr22-guide__schedule" aria-labelledby="guide-schedule-title">
      <header><span aria-hidden="true"><ConsumerIcon name="plan" /></span><div><h2 id="guide-schedule-title">내 AI 일정</h2><p>서버가 제공한 짧은 장소 미리보기입니다.</p></div></header>
      {guide.ai.itinerary.length ? <ol className="cr22-guide__itinerary">{guide.ai.itinerary.slice(0, 3).map((stop) => (
        <li key={stop.poiId}><span aria-hidden="true"><ConsumerIcon name="mapPin" size={18} /></span><div><strong>{stop.name}</strong><p>{stop.stayMinutes === null ? "체류 시간 확인 불가" : `체류 ${formatNumber(stop.stayMinutes)}분`}</p></div></li>
      ))}</ol> : <p className="cr22-guide__empty-copy">표시할 일정 미리보기가 없습니다. 전체 일정에서 현재 상태를 확인해 주세요.</p>}
      <ConsumerButton block disabled={!onNavigate} icon={<ConsumerIcon name="arrowRight" />} iconPosition="end" onClick={() => onNavigate?.("journey-result", journeyDecisionId)}>{guide.scheduleCta}</ConsumerButton>
      <ConsumerButton block disabled={!onNavigate} variant="secondary" onClick={() => onNavigate?.("planner")}>조건 변경</ConsumerButton>
    </aside>
  );
}

function AccessState({ accessState, onNavigate, onRetry }) {
  const copy = {
    ANONYMOUS: ["로그인이 필요합니다", "Premium 라이딩 가이드를 보려면 먼저 로그인해 주세요.", "로그인하기", "login"],
    FREE: ["Premium 이용권이 필요합니다", "이 화면은 Premium 활성 계정에서만 확인할 수 있습니다.", "Premium 이용권 보기", "premium"],
    EXPIRED: ["Premium 이용 기간이 만료되었습니다", "이용권을 다시 활성화한 뒤 라이딩 가이드를 확인해 주세요.", "이용권 다시 보기", "premium"],
    PROCESSING: ["결제를 확인하고 있습니다", "결제 상태가 ACTIVE가 되면 라이딩 가이드를 불러옵니다.", "상태 다시 확인", null],
    ERROR: ["이용 상태를 확인하지 못했습니다", "연결 상태를 확인한 뒤 다시 시도해 주세요.", "다시 시도", null],
  }[accessState] || ["가이드를 불러오는 중…", "Premium 이용 상태를 먼저 확인하고 있습니다.", null, null];

  return (
    <section className="cr22-guide__access" role={accessState === "ERROR" ? "alert" : "status"} aria-live="polite">
      <span aria-hidden="true"><ConsumerIcon name={accessState === "ERROR" ? "retry" : "plan"} size={30} /></span>
      <h1>{copy[0]}</h1><p>{copy[1]}</p>
      {copy[2] ? <ConsumerButton onClick={() => copy[3] ? onNavigate?.(copy[3]) : onRetry?.()}>{copy[2]}</ConsumerButton> : null}
    </section>
  );
}

export default function ConsumerRidingGuidePage({
  authState = "authenticated",
  guideContext = {},
  onNavigate,
  services = consumerGuideAdapter,
  stationId,
  user,
}) {
  const { journeyDecisionId = null, originLatitude = null, originLongitude = null, minutesAhead = null, requiredBikeCount = null, poiTheme = "PARK", poiLimit = 3 } = guideContext;
  const requestInput = useMemo(() => ({ stationId, journeyDecisionId, originLatitude, originLongitude, minutesAhead, requiredBikeCount, poiTheme, poiLimit }), [stationId, journeyDecisionId, originLatitude, originLongitude, minutesAhead, requiredBikeCount, poiTheme, poiLimit]);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState({ state: authState === "authenticated" ? "LOADING" : "ANONYMOUS", guide: null });

  useEffect(() => {
    if (authState !== "authenticated") {
      setView({ state: "ANONYMOUS", guide: null });
      return undefined;
    }
    let cancelled = false;
    setView({ state: "LOADING", guide: null });
    services.load(requestInput).then((result) => {
      if (!cancelled) setView({ state: result.accessState === "ACTIVE" ? "READY" : result.accessState, guide: result.guide });
    }).catch((error) => {
      if (cancelled) return;
      const state = error?.status === 401 || error?.code === "AUTH_REQUIRED" ? "ANONYMOUS" : error?.code === "PREMIUM_REQUIRED" ? "FREE" : "ERROR";
      setView({ state, guide: null });
    });
    return () => { cancelled = true; };
  }, [authState, reloadKey, requestInput, services]);

  const guide = view.guide;

  return (
    <ConsumerR2Theme className="cr22-guide">
      <ConsumerAppHeader activeItem={journeyDecisionId ? "planner" : "ride"} authState={authState} onAccount={() => onNavigate?.("mypage")} onLogin={() => onNavigate?.("login")} onNavigate={onNavigate} userName={user?.displayName || user?.name} userTier={view.state === "READY" ? "premium" : undefined} />
      <main id="main-content" className="cr22-guide__main">
        <ConsumerContainer>
          {view.state !== "READY" || !guide ? <AccessState accessState={view.state} onNavigate={onNavigate} onRetry={() => setReloadKey((current) => current + 1)} /> : <>
            <button className="cr22-guide__back" type="button" onClick={() => onNavigate?.("ride", stationId)}><ConsumerIcon name="arrowRight" size={17} /> 대여소로 돌아가기</button>
            <header className="cr22-guide__hero"><div><h1>Premium Riding Guide</h1><StatusBadge tone="premium">PREMIUM</StatusBadge></div><p>서버가 확인한 대여·날씨·대기질과 실제 장소 정보를 바탕으로 라이딩을 안내합니다.</p></header>
            <FactualOverview guide={guide} />
            {guide.factualPartial ? <aside className="cr22-guide__partial" role="status"><ConsumerIcon name="info" size={19} /><p>일부 사실 정보를 확인하지 못했습니다. 확인 가능한 값만 표시합니다.</p></aside> : null}
            <div className="cr22-guide__layout">
              <div className="cr22-guide__content"><AiSummary guide={guide} /><PlaceList guide={guide} /></div>
              <SchedulePanel guide={guide} journeyDecisionId={journeyDecisionId} onNavigate={onNavigate} />
            </div>
            <footer className="cr22-guide__footer"><ConsumerIcon name="info" size={20} /><p><strong>Premium AI 기반 라이딩 가이드입니다.</strong><span>AI가 확률·재고·날씨·장소·경로를 생성하지 않으며, 확인된 서버 근거와 설명을 분리해 보여드립니다.</span></p></footer>
          </>}
        </ConsumerContainer>
      </main>
    </ConsumerR2Theme>
  );
}
