import { useEffect, useMemo, useRef, useState } from "react";
import {
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
  FormField,
  SelectedPlaceCard,
  StatusBadge,
  SurfaceCard,
} from "../shared/index.js";
import { consumerJourneyAdapter, hasValue } from "../adapters/journey/index.js";
import "./journey.css";

const STEPS = [
  ["입력하기", "원하는 라이딩을 설명해 주세요"],
  ["조건 확인", "AI가 정리한 조건을 확인합니다"],
  ["추가 확인", "필요한 경우 한 번만 답합니다"],
  ["일정 생성", "실제 근거로 일정을 만듭니다"],
];

const ERROR_COPY = {
  PREMIUM_REQUIRED: "AI 플래너는 Premium 활성 계정에서 사용할 수 있습니다.",
  PREMIUM_ENTITLEMENT_UNAVAILABLE: "Premium 상태를 지금 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  JOURNEY_INTENT_INVALID: "라이딩 설명과 출발 조건을 확인해 주세요.",
  AI_OUTPUT_SCHEMA_INVALID: "AI가 조건을 안전하게 정리하지 못했습니다. 표현을 바꿔 다시 시도해 주세요.",
};

function display(value, suffix = "") {
  return hasValue(value) ? `${value}${suffix}` : "확인 필요";
}

function placeName(place) {
  return place?.displayName || "확인 필요";
}

function formatDateTime(value) {
  if (!value) return "확인 필요";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function hasPlannerContext(input) {
  const origin = input?.origin;
  const departureAt = new Date(input?.departureAt);
  return Boolean(origin?.placeId && origin?.displayName
    && Number.isFinite(origin?.latitude) && Number.isFinite(origin?.longitude)
    && !Number.isNaN(departureAt.getTime()) && departureAt.getTime() > Date.now()
    && Number.isInteger(Number(input?.maxJourneyMinutes))
    && Number(input?.maxJourneyMinutes) >= 1 && Number(input?.maxJourneyMinutes) <= 480
    && Number.isInteger(Number(input?.requiredBikeCount))
    && Number(input?.requiredBikeCount) >= 1 && Number(input?.requiredBikeCount) <= 5);
}

function initialContext(input) {
  const origin = input.origin;
  const departure = input.departureAt ? new Date(input.departureAt) : null;
  return {
    ...input,
    origin: origin ? { placeId: origin.placeId || origin.providerId, displayName: origin.displayName || origin.name, latitude: origin.latitude, longitude: origin.longitude } : null,
    departureAt: departure && !Number.isNaN(departure.getTime())
      ? new Date(departure.getTime() - departure.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "",
    maxJourneyMinutes: input.maxJourneyMinutes ?? "",
    requiredBikeCount: input.requiredBikeCount ?? "",
  };
}

function OriginPicker({ adapter, disabled, onSelect, origin }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [state, setState] = useState("idle");
  const requestId = useRef(0);

  useEffect(() => {
    const currentId = ++requestId.current;
    setPlaces([]);
    if (origin || query.trim().length < 2) { setState("idle"); return undefined; }
    setState("loading");
    const timer = window.setTimeout(async () => {
      try {
        const results = await adapter.searchPlaces(query.trim());
        if (requestId.current !== currentId) return;
        setPlaces(results);
        setState(results.length ? "ready" : "empty");
      } catch {
        if (requestId.current === currentId) setState("error");
      }
    }, 250);
    return () => { window.clearTimeout(timer); requestId.current += 1; };
  }, [adapter, origin, query]);

  if (origin) return <SelectedPlaceCard title={origin.displayName} onReselect={disabled ? undefined : () => { setQuery(origin.displayName); onSelect(null); }} />;
  return <div className="cr22-journey__place-answer">
    <FormField label="출발 장소" required hint="검색 결과에서 실제 장소를 선택해 주세요."><input name="journeyOrigin" autoComplete="off" disabled={disabled} value={query} onChange={(event) => setQuery(event.target.value)} /></FormField>
    {state === "loading" ? <p role="status">출발 장소를 찾고 있습니다.</p> : null}
    {state === "empty" ? <p role="status">검색 결과가 없습니다. 다른 장소를 검색해 주세요.</p> : null}
    {state === "error" ? <p role="alert">장소를 검색하지 못했습니다. 다시 입력해 주세요.</p> : null}
    {places.length ? <ul aria-label="출발 장소 검색 결과">{places.map((place) => <li key={place.placeId}><button type="button" disabled={disabled} onClick={() => onSelect(place)}><ConsumerIcon name="mapPin" /><span><strong>{place.displayName}</strong><small>출발 장소로 선택</small></span></button></li>)}</ul> : null}
  </div>;
}

function intentFields(decision) {
  const intent = decision?.normalizedIntent || {};
  const aiIntent = intent.aiIntent || {};
  const themes = intent.constraints?.themes || aiIntent.hardConstraints?.themes || Object.keys(aiIntent.preferences || intent.preferences || {});
  return [
    ["mapPin", "시작 지역", placeName(intent.origin || aiIntent.origin)],
    ["plan", "목적 지역", placeName(intent.destination || aiIntent.destination)],
    ["transit", "출발 시각", formatDateTime(intent.departureAt || aiIntent.startAt)],
    ["ride", "라이딩 시간", display(intent.maxJourneyMinutes ?? aiIntent.totalMinutes, "분")],
    ["bike", "필요 자전거", display(intent.requiredBikeCount ?? aiIntent.requiredBikeCount, "대")],
    ["qna", "관심", themes.length ? themes.join(" · ") : "확인 필요"],
  ];
}

function PlannerStepper({ stage }) {
  const active = stage === "INPUT" || stage === "ERROR" ? 0 : stage === "INTENT_CONFIRM" ? 1 : stage === "CLARIFICATION" ? 2 : 3;
  return <ol className="cr22-journey__stepper" aria-label="AI 계획 진행 단계">
    {STEPS.map(([title, description], index) => <li className={index < active ? "is-complete" : index === active ? "is-active" : ""} key={title} aria-current={index === active ? "step" : undefined}>
      <span className="cr22-journey__step-number">{index < active ? <ConsumerIcon name="check" size={18} /> : index + 1}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
    </li>)}
  </ol>;
}

function IntentConfirm({ decision, onBack, onConfirm }) {
  return <>
    <div className="cr22-journey__page-title">
      <div><p className="cr22-journey__breadcrumb">AI 플래너 <span aria-hidden="true">›</span> 조건 확인</p><h1>AI 조건 확인 <StatusBadge tone="premium">PREMIUM</StatusBadge></h1><p>AI가 정리한 조건입니다. 확인이 필요한 값은 일정 생성 전에 다시 입력해 주세요.</p></div>
    </div>
    <PlannerStepper stage="INTENT_CONFIRM" />
    <div className="cr22-journey__confirm-layout">
      <SurfaceCard title="AI가 정리한 라이딩 조건">
        <p className="cr22-journey__section-note"><ConsumerIcon name="info" size={17} /> 확인된 구조화 조건만 표시합니다.</p>
        <div className="cr22-journey__intent-grid">
          {intentFields(decision).map(([icon, label, value]) => <article className="cr22-journey__intent-card" key={label}>
            <span aria-hidden="true"><ConsumerIcon name={icon} /></span><small>{label}</small><strong>{value}</strong>
          </article>)}
        </div>
        <p className="cr22-journey__truth-banner"><ConsumerIcon name="info" size={17} /> 실제 데이터 조회 결과와 환경 정보를 바탕으로 다음 화면의 일정을 구성합니다.</p>
        <div className="cr22-journey__split-actions">
          <ConsumerButton variant="secondary" onClick={onBack}>설명 다시 입력</ConsumerButton>
          <ConsumerButton icon={<span aria-hidden="true">✦</span>} onClick={onConfirm}>이 조건으로 일정 보기</ConsumerButton>
        </div>
      </SurfaceCard>
      <SurfaceCard quiet title="일정에 반영되는 범위">
        <div className="cr22-journey__evidence-preview" aria-label="일정 구성 범위">
          {["실제 출발·목적 장소", "현재 대여소 후보", "실제 이동 경로", "확인 가능한 환경 근거"].map((item) => <p key={item}><ConsumerIcon name="check" size={17} /> {item}</p>)}
        </div>
        <p className="cr22-journey__muted">확인되지 않은 확률·시간·거리·장소는 만들지 않습니다.</p>
      </SurfaceCard>
    </div>
  </>;
}

function Clarification({ adapter, decision, onBack, onResolved }) {
  const missingField = decision.clarification?.missingFields?.[0];
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [working, setWorking] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [notice, setNotice] = useState("");
  const options = decision.clarification?.options || [];

  async function search(value) {
    setQuery(value); setAnswer(null);
    if (value.trim().length < 2 || !["origin", "destination"].includes(missingField)) { setPlaces([]); return; }
    try { setPlaces(await adapter.searchPlaces(value)); } catch { setPlaces([]); setNotice("장소 후보를 불러오지 못했습니다."); }
  }

  function choose(value) {
    if (missingField === "requiredBikeCount") setAnswer({ requiredBikeCount: value });
    else if (["maxJourneyMinutes", "totalMinutes"].includes(missingField)) setAnswer({ maxJourneyMinutes: value });
    else if (["departureAt", "startAt"].includes(missingField)) setAnswer({ departureAt: value });
    else if (["origin", "destination"].includes(missingField)) setAnswer({ [missingField]: value });
  }

  async function continuePlan() {
    if (!answer) { setNotice("질문에 한 가지 답을 선택해 주세요."); return; }
    setWorking(true); setNotice("");
    try {
      const next = await adapter.answerClarification(decision, answer);
      if (next.status === "CLARIFICATION_REQUIRED") {
        setExhausted(true);
        setNotice("한 번의 추가 확인으로 조건을 확정하지 못했습니다. 설명을 다시 입력해 주세요.");
      }
      else onResolved(next);
    } catch (error) { setNotice(ERROR_COPY[error.code] || "추가 조건을 반영하지 못했습니다. 다시 시도해 주세요."); }
    finally { setWorking(false); }
  }

  const numericOptions = missingField === "requiredBikeCount" ? [1, 2, 3, 4, 5] : [60, 90, 120];
  const supportsPlace = ["origin", "destination"].includes(missingField);
  const supportsDateTime = ["departureAt", "startAt"].includes(missingField);
  const supportsNumeric = ["requiredBikeCount", "maxJourneyMinutes", "totalMinutes"].includes(missingField);
  return <>
    <div className="cr22-journey__page-title"><div><p className="cr22-journey__breadcrumb">AI 플래너 <span aria-hidden="true">›</span> 추가 확인</p><h1>AI 추가 확인 <StatusBadge tone="premium">PREMIUM</StatusBadge></h1><p>정확한 일정을 위해 아래 질문에 한 가지만 답해 주세요.</p></div></div>
    <PlannerStepper stage="CLARIFICATION" />
    <div className="cr22-journey__clarify-layout">
      <SurfaceCard>
        <div className="cr22-journey__question-head"><span aria-hidden="true">?</span><div><strong>마지막 확인이 필요해요</strong><small>최대 1회 질문</small></div></div>
        <h2 className="cr22-journey__question">{decision.clarification?.question || "일정에 필요한 조건을 선택해 주세요."}</h2>
        {supportsPlace ? <div className="cr22-journey__place-answer">
          <label htmlFor="clarification-place">{missingField === "origin" ? "출발 장소" : "목적 장소"}</label>
          <input id="clarification-place" name="clarificationPlace" autoComplete="off" value={query} onChange={(event) => search(event.target.value)} placeholder="두 글자 이상 입력해 실제 장소를 검색하세요…" />
          {places.length ? <ul aria-label="실제 장소 검색 결과">{places.map((place) => <li key={place.placeId}><button type="button" aria-pressed={answer?.[missingField]?.placeId === place.placeId} onClick={() => { choose(place); setQuery(place.displayName); setPlaces([]); }}><ConsumerIcon name="mapPin" /><span><strong>{place.displayName}</strong><small>실제 provider 검색 결과</small></span></button></li>)}</ul> : null}
        </div> : null}
        {supportsDateTime ? <div className="cr22-journey__place-answer">
          <label htmlFor="clarification-departure">출발 희망 시각</label>
          <input id="clarification-departure" name="clarificationDeparture" autoComplete="off" type="datetime-local" onChange={(event) => choose(event.target.value)} />
        </div> : null}
        {supportsNumeric ? <div className="cr22-journey__answer-grid">
          {(options.length ? options : numericOptions).map((option) => { const value = typeof option === "object" ? option.value : option; const label = typeof option === "object" ? option.label : missingField === "requiredBikeCount" ? `${option}대` : `${option}분`; return <button type="button" key={String(value)} aria-pressed={Object.values(answer || {}).includes(value)} onClick={() => choose(value)}><span className="cr22-journey__radio" aria-hidden="true" /><strong>{label}</strong>{typeof option === "object" && option.description ? <small>{option.description}</small> : null}</button>; })}
        </div> : null}
        {!supportsPlace && !supportsDateTime && !supportsNumeric ? <p className="cr22-journey__notice" role="alert">이 조건은 한 번의 구조화 질문으로 확인할 수 없습니다. 설명을 다시 입력해 주세요.</p> : null}
        <p className="cr22-journey__truth-banner"><ConsumerIcon name="info" size={17} /> 이 답변은 현재 질문에만 사용되며 다른 조건은 유지됩니다.</p>
        {notice ? <p className="cr22-journey__notice" role="alert">{notice}</p> : null}
        <div className="cr22-journey__stack-actions"><ConsumerButton block disabled={exhausted} loading={working} loadingLabel="조건 반영 중…" onClick={continuePlan}>선택하고 계속</ConsumerButton><ConsumerButton block variant="secondary" onClick={onBack}>{exhausted ? "설명 다시 입력" : "이전 단계로 돌아가기"}</ConsumerButton></div>
      </SurfaceCard>
      <SurfaceCard quiet title="현재까지 정리된 조건"><div className="cr22-journey__condition-list">{intentFields(decision).map(([, label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}</div><p className="cr22-journey__truth-banner"><ConsumerIcon name="info" size={17} /> 추가 답변 이후에는 같은 계획에서 다시 질문하지 않습니다.</p></SurfaceCard>
    </div>
  </>;
}

export default function ConsumerJourneyPlannerPage({
  adapter = consumerJourneyAdapter,
  authState = "authenticated",
  initialInput = {},
  onInputChange,
  onLogin,
  onNavigate,
  onResult,
  user,
}) {
  const [stage, setStage] = useState("INPUT");
  const [text, setText] = useState("");
  const [decision, setDecision] = useState(null);
  const [notice, setNotice] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [context, setContext] = useState(() => initialContext(initialInput));
  const count = useMemo(() => Array.from(text).length, [text]);

  function updateContext(patch) {
    const next = { ...context, ...patch };
    setContext(next);
    onInputChange?.(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!text.trim()) { setNotice("원하는 라이딩을 자연어로 설명해 주세요."); return; }
    if (count > 500) { setNotice("라이딩 설명은 500자 이내로 입력해 주세요."); return; }
    if (!hasPlannerContext(context)) {
      setNotice("출발 장소를 검색 결과에서 선택하고, 미래 출발 시각·1~480분의 이용 시간·자전거 1~5대를 입력해 주세요.");
      setStage("ERROR");
      return;
    }
    setStage("GENERATING"); setNotice(""); setAuthRequired(false);
    try {
      const next = await adapter.planNaturalLanguage(text, context);
      setDecision(next);
      setStage(next.status === "CLARIFICATION_REQUIRED" ? "CLARIFICATION" : "INTENT_CONFIRM");
    } catch (error) {
      const loginRequired = error.status === 401 || error.code === "AUTH_REQUIRED";
      setAuthRequired(loginRequired);
      setNotice(loginRequired ? "로그인 세션이 만료되었습니다. 다시 로그인해 주세요." : ERROR_COPY[error.code] || "AI 조건을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setStage("ERROR");
    }
  }

  function openResult(next = decision) {
    onResult?.(next);
    onNavigate?.("journey-result", next?.decisionId);
  }

  function reset() { setText(""); setDecision(null); setNotice(""); setStage("INPUT"); }

  return <ConsumerR2Theme className="cr22-journey">
    <ConsumerAppHeader activeItem="planner" authState={authState} onLogin={onLogin} onNavigate={onNavigate} userName={user?.name || user?.displayName} userTier={user?.tier} />
    <ConsumerContainer as="main" id="main-content" className="cr22-journey__content">
      {stage === "INTENT_CONFIRM" ? <IntentConfirm decision={decision} onBack={() => setStage("INPUT")} onConfirm={() => openResult()} /> : null}
      {stage === "CLARIFICATION" ? <Clarification adapter={adapter} decision={decision} onBack={reset} onResolved={(next) => { setDecision(next); setStage("INTENT_CONFIRM"); }} /> : null}
      {["INPUT", "GENERATING", "ERROR"].includes(stage) ? <>
        <div className="cr22-journey__page-title"><div><p className="cr22-journey__breadcrumb"><ConsumerIcon name="home" size={15} /> <span aria-hidden="true">›</span> AI 플래너</p><h1>자연어로 나만의 라이딩 일정을 만들어보세요</h1><p>원하는 코스, 시간, 장소, 테마를 설명하면 AI가 조건을 정리하고 실제 근거로 일정을 구성합니다.</p></div><ConsumerButton variant="secondary" size="sm" icon={<ConsumerIcon name="qna" />} onClick={() => onNavigate?.("qna")}>이용 안내</ConsumerButton></div>
        <PlannerStepper stage={stage} />
        <form className="cr22-journey__input-card" noValidate onSubmit={submit}>
          <div className="cr22-journey__input-head"><div><h2>라이딩 계획을 설명해 주세요</h2><p>자연어로 자유롭게 입력해 주세요.</p></div><span>이용 가능: <StatusBadge tone="premium">PREMIUM 전용</StatusBadge></span></div>
          <div className="cr22-journey__replan">
            <OriginPicker adapter={adapter} disabled={stage === "GENERATING"} origin={context.origin} onSelect={(origin) => updateContext({ origin })} />
            <FormField label="출발 희망 시각" required><input name="journeyDepartureAt" autoComplete="off" type="datetime-local" disabled={stage === "GENERATING"} value={context.departureAt} onChange={(event) => updateContext({ departureAt: event.target.value })} /></FormField>
            <FormField label="라이딩 이용 시간 (분)" required><input name="journeyMinutes" autoComplete="off" type="number" min="1" max="480" disabled={stage === "GENERATING"} value={context.maxJourneyMinutes} onChange={(event) => updateContext({ maxJourneyMinutes: event.target.value === "" ? "" : Number(event.target.value) })} /></FormField>
            <FormField label="필요한 자전거 수" required><select name="journeyBikeCount" disabled={stage === "GENERATING"} value={context.requiredBikeCount} onChange={(event) => updateContext({ requiredBikeCount: Number(event.target.value) })}><option value="">선택해 주세요</option>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}대</option>)}</select></FormField>
          </div>
          <label className="cr22-journey__prompt" htmlFor="journey-prompt"><span className="cr22-sr-only">라이딩 계획 설명</span><textarea id="journey-prompt" name="naturalLanguageJourney" autoComplete="off" aria-label="라이딩 계획 설명" value={text} maxLength={500} disabled={stage === "GENERATING"} onChange={(event) => setText(event.target.value)} placeholder={"예) 성수에서 따릉이를 빌려 한강 쪽으로 2시간 정도 라이딩하고,\n중간에 카페도 들르고 싶어요…"} /><small>{count} / 500</small></label>
          <div className="cr22-journey__input-support"><div><strong><ConsumerIcon name="info" size={18} /> 입력 팁</strong><ul><li>출발지, 시간, 원하는 코스나 테마를 함께 적어 주세요.</li><li>필요한 자전거 수와 들르고 싶은 장소도 적을 수 있습니다.</li></ul></div><aside><strong><span aria-hidden="true">✦</span> 안내</strong><p>다음 단계에서 AI가 정리한 조건을 확인하고, 필요할 때 한 번만 추가 답변할 수 있습니다.</p></aside></div>
          {notice ? <p className="cr22-journey__notice" role="alert">{notice}</p> : null}
          {authRequired ? <ConsumerButton type="button" onClick={onLogin}>다시 로그인</ConsumerButton> : null}
          <div className="cr22-journey__input-actions"><ConsumerButton variant="secondary" type="button" icon={<ConsumerIcon name="retry" />} onClick={reset}>초기화</ConsumerButton><ConsumerButton type="submit" loading={stage === "GENERATING"} loadingLabel="AI가 조건을 정리하는 중…" icon={<span aria-hidden="true">✦</span>} iconPosition="start">AI 조건 정리하기</ConsumerButton></div>
          <p className="cr22-journey__premium-note"><ConsumerIcon name="info" size={15} /> AI 플래너는 Premium 활성 계정에서 이용할 수 있습니다.</p>
        </form>
      </> : null}
    </ConsumerContainer>
  </ConsumerR2Theme>;
}
