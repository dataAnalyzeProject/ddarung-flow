import { useEffect, useRef, useState } from "react";
import {
  ConsumerAppHeader, ConsumerButton, ConsumerContainer, ConsumerIcon,
  ConsumerR2Theme, FormField, StatusBadge,
} from "../shared/index.js";
import { consumerJourneyAdapter, hasValue } from "../adapters/journey/index.js";
import "./journey.css";

const DRAFT_KEY = "consumer-journey-planner-draft";
const THEME_OPTIONS = [["PARK", "공원"], ["RIVER", "한강·하천"], ["CAFE", "카페"], ["ATTRACTION", "명소"], ["CULTURE", "문화"], ["FOOD", "음식"]];
const PREFERENCE_OPTIONS = [["stability", "안정성"], ["lowSlope", "완만한 경사"], ["bikeLane", "자전거 도로"], ["scenery", "풍경"], ["culture", "문화 체험"], ["cafe", "카페 방문"], ["avoidCrowds", "한적한 곳"]];
const FIELD_LABELS = { origin: "출발 장소", destination: "목적 장소", departureAt: "출발 시각", startAt: "출발 시각", maxJourneyMinutes: "이용 시간", totalMinutes: "이용 시간", requiredBikeCount: "자전거 수", preferences: "선호 조건", constraints: "테마" };
const ERROR_COPY = {
  PREMIUM_REQUIRED: "AI 플래너는 Premium 활성 계정에서 사용할 수 있습니다.",
  PREMIUM_ENTITLEMENT_UNAVAILABLE: "Premium 상태를 지금 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  JOURNEY_INTENT_INVALID: "입력한 조건을 확인해 주세요. 설명과 선택한 내용은 유지됩니다.",
  AI_PROVIDER_UNAVAILABLE: "AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  AI_PROVIDER_TIMEOUT: "AI 응답 시간이 초과되었습니다. 입력은 유지되니 다시 시도해 주세요.",
  AI_OUTPUT_SCHEMA_INVALID: "AI 응답 형식을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.",
  AI_TOOL_VALUE_MISMATCH: "AI 일정이 실제 근거와 일치하지 않아 전체 일정을 만들지 못했습니다. 입력은 유지됩니다.",
  AI_PROVIDER_REFUSAL: "AI가 이 설명으로 조건을 정리하지 못했습니다. 설명을 바꿔 다시 시도해 주세요.",
};

function errorCopy(error) {
  if (error?.status === 401 || error?.code === "AUTH_REQUIRED") return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
  return ERROR_COPY[error?.code] || (error?.status >= 500
    ? "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
}

function unavailableError(decision) {
  const codes = (decision?.warnings || []).map((warning) => typeof warning === "string" ? warning : warning?.code);
  return { code: codes.find((code) => ERROR_COPY[code]) || "AI_PROVIDER_UNAVAILABLE" };
}

function verifiedPlace(place) {
  const placeId = place?.placeId || place?.providerId;
  return placeId && place?.displayName && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
    ? { placeId, displayName: place.displayName, latitude: place.latitude, longitude: place.longitude } : null;
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function initialContext(input = {}) {
  return {
    origin: verifiedPlace(input.origin), destination: verifiedPlace(input.destination),
    departureAt: localDateTime(input.departureAt), maxJourneyMinutes: input.maxJourneyMinutes ?? "",
    requiredBikeCount: input.requiredBikeCount ?? "", preferences: input.preferences || {},
    avoid: input.avoid || [], ...(input.constraints ? { constraints: input.constraints } : {}),
  };
}

function readDraft() {
  try { return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; }
}

function confirmationValues(decision, context) {
  const intent = decision.normalizedIntent || {};
  const ai = intent.aiIntent || {};
  const origin = verifiedPlace(intent.origin) || context.origin;
  const destination = verifiedPlace(intent.destination) || context.destination;
  const preferences = { ...(ai.preferences || {}), ...(context.preferences || {}), ...(intent.preferences || {}) };
  const proposedThemes = intent.constraints?.themes ?? context.constraints?.themes ?? ai.hardConstraints?.themes
    ?? [["CAFE", "cafe"], ["CULTURE", "culture"]].filter(([, preference]) => Number(preferences[preference]) > 3).map(([theme]) => theme);
  return {
    origin, destination,
    // AI place references are search queries, even if the response contains IDs or coordinates.
    originQuery: origin?.displayName || ai.origin?.displayName || ai.origin?.query || "",
    destinationQuery: destination?.displayName || ai.destination?.displayName || ai.destination?.query || "",
    departureAt: localDateTime(intent.departureAt || context.departureAt || ai.startAt),
    maxJourneyMinutes: intent.maxJourneyMinutes ?? (hasValue(context.maxJourneyMinutes) ? context.maxJourneyMinutes : ai.totalMinutes) ?? "",
    requiredBikeCount: intent.requiredBikeCount ?? (hasValue(context.requiredBikeCount) ? context.requiredBikeCount : ai.requiredBikeCount) ?? "",
    preferences, avoid: intent.avoid || context.avoid || [],
    constraints: { ...(context.constraints || {}), ...(intent.constraints || {}), themes: Array.isArray(proposedThemes) ? proposedThemes.filter((theme) => THEME_OPTIONS.some(([value]) => value === theme)) : [] },
  };
}

function validationErrors(values) {
  const errors = {};
  if (!verifiedPlace(values.origin)) errors.origin = "출발 장소를 검색 결과에서 선택해 주세요.";
  if (!verifiedPlace(values.destination)) errors.destination = "목적 장소를 검색 결과에서 선택해 주세요.";
  const departure = new Date(values.departureAt).getTime();
  if (!values.departureAt || Number.isNaN(departure)) errors.departureAt = "올바른 출발 시각을 입력해 주세요.";
  else if (departure <= Date.now()) errors.departureAt = "출발 시각은 현재보다 미래로 선택해 주세요.";
  const minutes = Number(values.maxJourneyMinutes);
  if (!hasValue(values.maxJourneyMinutes) || !Number.isInteger(minutes)) errors.maxJourneyMinutes = "이용 시간을 정수로 입력해 주세요.";
  else if (minutes < 1) errors.maxJourneyMinutes = "이용 시간은 1분 이상 입력해 주세요.";
  else if (minutes > 480) errors.maxJourneyMinutes = "이용 시간은 480분 이하로 입력해 주세요.";
  const bikes = Number(values.requiredBikeCount);
  if (!hasValue(values.requiredBikeCount) || !Number.isInteger(bikes)) errors.requiredBikeCount = "자전거 수를 정수로 입력해 주세요.";
  else if (bikes < 1) errors.requiredBikeCount = "자전거 수는 1대 이상 입력해 주세요.";
  else if (bikes > 5) errors.requiredBikeCount = "자전거 수는 5대 이하로 입력해 주세요.";
  return errors;
}

function PlacePicker({ adapter, disabled, error, field, onChange, place, query }) {
  const [places, setPlaces] = useState([]);
  const [state, setState] = useState("idle");
  const requestId = useRef(0);
  const label = FIELD_LABELS[field];
  useEffect(() => {
    const currentId = ++requestId.current;
    setPlaces([]);
    if (place || query.trim().length < 2 || disabled) { setState("idle"); return undefined; }
    setState("loading");
    const timer = window.setTimeout(async () => {
      try {
        const results = (await adapter.searchPlaces(query.trim())).map(verifiedPlace).filter(Boolean);
        if (requestId.current !== currentId) return;
        setPlaces(results); setState(results.length ? "ready" : "empty");
      } catch { if (requestId.current === currentId) setState("error"); }
    }, 250);
    return () => { window.clearTimeout(timer); requestId.current += 1; };
  }, [adapter, disabled, place, query]);
  return <div className="cr22-journey__place-answer">
    <FormField id={`journey-${field}`} label={label} required error={error} hint={place ? "선택한 장소입니다. 검색어를 바꾸면 다시 선택해야 합니다." : "두 글자 이상 검색한 뒤 실제 장소를 선택해 주세요."}>
      <input name={field} autoComplete="off" disabled={disabled} value={query} onChange={(event) => onChange(null, event.target.value)} />
    </FormField>
    {place ? <p className="cr22-journey__selected-place"><ConsumerIcon name="check" size={17} /> {place.displayName} 선택됨 <button type="button" disabled={disabled} onClick={() => onChange(null, "")}>{label} 선택 해제</button></p> : null}
    {state === "loading" ? <p role="status">{label}를 찾고 있습니다.</p> : null}
    {state === "empty" ? <p role="status">검색 결과가 없습니다. 다른 장소를 검색해 주세요.</p> : null}
    {state === "error" ? <p role="alert">장소를 검색하지 못했습니다. 다시 입력해 주세요.</p> : null}
    {places.length ? <ul aria-label={`${label} 검색 결과`}>{places.map((candidate) => <li key={candidate.placeId}><button type="button" disabled={disabled} onClick={() => onChange(candidate, candidate.displayName)}><ConsumerIcon name="mapPin" /><span><strong>{candidate.displayName}</strong><small>{label}로 선택</small></span></button></li>)}</ul> : null}
  </div>;
}

function PlannerStepper({ confirming, planning }) {
  const active = planning ? 2 : confirming ? 1 : 0;
  return <ol className="cr22-journey__stepper" aria-label="AI 계획 진행 단계">
    {[["입력하기", "원하는 라이딩을 설명해 주세요"], ["조건 확인", "장소와 조건을 한 번에 확인해요"], ["일정 생성", "실제 근거로 일정을 만듭니다"]].map(([title, description], index) => <li key={title} className={index === active ? "is-active" : index < active ? "is-complete" : ""} aria-current={index === active ? "step" : undefined}><span className="cr22-journey__step-number">{index + 1}</span><span><strong>{title}</strong><small>{description}</small></span></li>)}
  </ol>;
}

export default function ConsumerJourneyPlannerPage({ adapter = consumerJourneyAdapter, authState = "authenticated", initialInput = {}, onInputChange, onLogin, onNavigate, onResult, user }) {
  const [savedDraft] = useState(readDraft);
  const [text, setText] = useState(savedDraft.text || "");
  const [context, setContext] = useState(() => initialContext({ ...savedDraft.context, ...initialInput }));
  const [stage, setStage] = useState("INPUT");
  const [decision, setDecision] = useState(null);
  const [factualDecision, setFactualDecision] = useState(null);
  const [values, setValues] = useState(null);
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState({});
  const [authRequired, setAuthRequired] = useState(false);
  const promptRef = useRef(null);
  const formRef = useRef(null);
  const headingRef = useRef(null);
  const confirming = stage === "CONFIRM" || stage === "PLANNING";
  const working = stage === "COMPILING" || stage === "PLANNING";
  const count = Array.from(text).length;

  useEffect(() => {
    try {
      if (text || Object.values(context).some((value) => hasValue(value) && typeof value !== "object")) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text, context }));
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* The in-memory draft remains available when storage is disabled. */ }
  }, [context, text]);

  useEffect(() => { if (confirming) headingRef.current?.focus(); }, [confirming]);

  function updateContext(patch) {
    const next = { ...context, ...patch };
    setContext(next);
    onInputChange?.(next);
  }

  function updateValues(patch) {
    setValues((previous) => ({ ...previous, ...patch }));
    const userFields = Object.fromEntries(Object.entries(patch).filter(([key]) => !key.endsWith("Query")));
    updateContext(userFields);
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([field]) => !(field in patch))));
  }

  function reportError(error) {
    setAuthRequired(error?.status === 401 || error?.code === "AUTH_REQUIRED");
    setNotice(errorCopy(error));
  }

  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || count > 500) {
      setErrors({ text: !text.trim() ? "원하는 라이딩을 자연어로 설명해 주세요." : "라이딩 설명은 500자 이내로 입력해 주세요." });
      promptRef.current?.focus(); return;
    }
    setStage("COMPILING"); setNotice(""); setErrors({}); setAuthRequired(false); setDecision(null); setFactualDecision(null);
    try {
      const invalidContext = validationErrors(context);
      const compileContext = { ...context };
      ["departureAt", "maxJourneyMinutes", "requiredBikeCount"].forEach((field) => { if (invalidContext[field]) compileContext[field] = ""; });
      const next = await adapter.planNaturalLanguage(text, compileContext);
      if (next?.status === "UNAVAILABLE") throw unavailableError(next);
      if (next?.status !== "CLARIFICATION_REQUIRED" || !next.decisionId || !next.normalizedIntent) throw Object.assign(new Error("Invalid AI draft"), { code: "AI_OUTPUT_SCHEMA_INVALID" });
      setDecision(next); setValues(confirmationValues(next, compileContext)); setStage("CONFIRM");
    } catch (error) { reportError(error); setStage("INPUT"); }
  }

  async function confirm(event) {
    event.preventDefault();
    const invalid = validationErrors(values);
    setErrors(invalid); setNotice(""); setAuthRequired(false); setFactualDecision(null);
    if (Object.keys(invalid).length) { formRef.current?.querySelector(`[name="${Object.keys(invalid)[0]}"]`)?.focus(); return; }
    setStage("PLANNING");
    try {
      const { originQuery, destinationQuery, ...confirmed } = values;
      updateContext(confirmed);
      const next = await adapter.answerClarification(decision, confirmed);
      if (next?.decisionId === decision.decisionId && Number.isInteger(next.revision) && next.revision > decision.revision) setDecision(next);
      const retainedFacts = next?.unifiedPlan && Object.values(next.unifiedPlan.evidence || {}).some((group) => group && Object.keys(group).length);
      if (next?.status === "UNAVAILABLE") {
        if (retainedFacts) setFactualDecision(next);
        throw unavailableError(next);
      }
      if (next?.status === "CLARIFICATION_REQUIRED") {
        setDecision(next); setNotice("아직 확인이 필요한 조건이 있습니다. 아래 입력을 확인해 주세요.");
        const missing = (next.clarification?.missingFields || []).filter((field) => FIELD_LABELS[field]);
        const nextErrors = Object.fromEntries(missing.map((field) => [field === "startAt" ? "departureAt" : field === "totalMinutes" ? "maxJourneyMinutes" : field, `${FIELD_LABELS[field]}을 다시 확인해 주세요.`]));
        setErrors(nextErrors);
        window.requestAnimationFrame(() => formRef.current?.querySelector(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus());
      } else if (["READY", "PARTIAL"].includes(next?.status) && next?.unifiedPlan) {
        onResult?.(next); onNavigate?.("journey-result", next.decisionId);
      } else throw Object.assign(new Error("Invalid AI plan"), { code: "AI_OUTPUT_SCHEMA_INVALID" });
    } catch (error) { reportError(error); }
    finally { setStage("CONFIRM"); }
  }

  function reset() {
    setText(""); setDecision(null); setFactualDecision(null); setValues(null); setNotice(""); setErrors({}); setAuthRequired(false); setStage("INPUT");
    updateContext(initialContext());
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage can be disabled. */ }
    promptRef.current?.focus();
  }

  const contextItems = [context.origin?.displayName, context.destination?.displayName, context.departureAt?.replace("T", " "), hasValue(context.maxJourneyMinutes) ? `${context.maxJourneyMinutes}분` : null, hasValue(context.requiredBikeCount) ? `${context.requiredBikeCount}대` : null].filter(Boolean);
  const conflicts = [...new Set((decision?.normalizedIntent?.contextConflicts || []).map((field) => FIELD_LABELS[field]).filter(Boolean))];
  return <ConsumerR2Theme className="cr22-journey cr22-journey--planner">
    <ConsumerAppHeader activeItem="planner" authState={authState} onLogin={onLogin} onNavigate={onNavigate} userName={user?.name || user?.displayName} userTier={user?.tier} />
    <ConsumerContainer as="main" id="main-content" className="cr22-journey__content">
      <div className="cr22-journey__page-title"><div><p className="cr22-journey__breadcrumb">AI 플래너 <span aria-hidden="true">›</span> {confirming ? "조건 확인" : "라이딩 계획"}</p><h1 ref={headingRef} tabIndex={-1}>{confirming ? "AI 조건 확인" : "어떤 라이딩을 하고 싶으세요?"}</h1><p>{confirming ? "AI가 정리한 초안입니다. 실제 장소를 선택하고 조건을 한 번에 확인해 주세요." : "장소, 시간, 하고 싶은 일을 적으면 AI가 라이딩 조건을 정리해 드려요."}</p></div><StatusBadge tone="premium">PREMIUM</StatusBadge></div>
      <PlannerStepper confirming={confirming} planning={stage === "PLANNING"} />
      {!confirming ? <form className="cr22-journey__input-card" noValidate onSubmit={submit}>
        <div className="cr22-journey__input-head"><h2>라이딩 계획을 설명해 주세요</h2><span>1~500자</span></div>
        {contextItems.length ? <div className="cr22-journey__context"><span><strong>가져온 조건</strong> {contextItems.join(" · ")}<small>다음 단계에서 수정할 수 있어요.</small></span><ConsumerButton variant="secondary" disabled={working} onClick={() => updateContext(initialContext())}>조건 지우기</ConsumerButton></div> : null}
        <div className="cr22-journey__prompt"><label className="cr22-sr-only" htmlFor="journey-prompt">라이딩 계획 설명</label><textarea ref={promptRef} id="journey-prompt" name="naturalLanguageJourney" autoComplete="off" required aria-invalid={Boolean(errors.text)} aria-describedby={errors.text ? "journey-prompt-error journey-prompt-count" : "journey-prompt-count"} value={text} disabled={working} onChange={(event) => { setText(event.target.value); setErrors({}); setDecision(null); }} placeholder="예) 내일 오후 2시에 성수에서 출발해 서울숲까지 90분 정도 달리고, 중간에 카페에 들르고 싶어요. 자전거는 2대가 필요해요." /><small id="journey-prompt-count">{count} / 500</small></div>
        {errors.text ? <p className="cr22-journey__notice" id="journey-prompt-error" role="alert">{errors.text}</p> : null}
        <p className="cr22-journey__input-explanation"><ConsumerIcon name="info" size={18} /> 다음 화면에서 장소·시각·이용 시간·자전거 수를 확인한 뒤 일정을 만듭니다.</p>
        {notice ? <p className="cr22-journey__notice" role="alert">{notice}</p> : null}
        {authRequired ? <ConsumerButton onClick={onLogin}>다시 로그인</ConsumerButton> : null}
        <div className="cr22-journey__input-actions"><ConsumerButton variant="secondary" disabled={working} icon={<ConsumerIcon name="retry" />} onClick={reset}>초기화</ConsumerButton><ConsumerButton type="submit" loading={working} loadingLabel="AI가 조건을 정리하는 중…" icon={<span aria-hidden="true">✦</span>}>AI 조건 정리하기</ConsumerButton></div>
        <p className="cr22-journey__premium-note">Premium 활성 계정에서 이용할 수 있습니다.</p>
      </form> : <form ref={formRef} className="cr22-journey__input-card cr22-journey__confirmation" noValidate onSubmit={confirm}>
        <p className="cr22-journey__draft-text">{text}</p>
        {conflicts.length ? <p className="cr22-journey__conflict" role="status">{conflicts.join(" · ")}: 설명과 가져온 조건이 달라 선택해 둔 조건을 유지했습니다. 아래에서 수정할 수 있어요.</p> : null}
        <div className="cr22-journey__confirm-places">{["origin", "destination"].map((field) => <PlacePicker key={field} adapter={adapter} disabled={working} error={errors[field]} field={field} place={values[field]} query={values[`${field}Query`]} onChange={(place, query) => updateValues({ [field]: place, [`${field}Query`]: query })} />)}</div>
        <div className="cr22-journey__confirm-numbers">
          <FormField label="출발 희망 시각" required error={errors.departureAt}><input name="departureAt" type="datetime-local" disabled={working} value={values.departureAt} onChange={(event) => updateValues({ departureAt: event.target.value })} /></FormField>
          <FormField label="라이딩 이용 시간 (분)" required error={errors.maxJourneyMinutes}><input name="maxJourneyMinutes" type="number" min="1" max="480" step="1" disabled={working} value={values.maxJourneyMinutes} onChange={(event) => updateValues({ maxJourneyMinutes: event.target.value })} /></FormField>
          <FormField label="필요한 자전거 수" required error={errors.requiredBikeCount}><input name="requiredBikeCount" type="number" min="1" max="5" step="1" disabled={working} value={values.requiredBikeCount} onChange={(event) => updateValues({ requiredBikeCount: event.target.value })} /></FormField>
        </div>
        <fieldset className="cr22-journey__theme-field" disabled={working}><legend>관심 테마 (선택)</legend><div>{THEME_OPTIONS.map(([theme, label]) => <label key={theme}><input type="checkbox" name="themes" checked={values.constraints.themes.includes(theme)} onChange={(event) => updateValues({ constraints: { ...values.constraints, themes: event.target.checked ? [...values.constraints.themes, theme] : values.constraints.themes.filter((value) => value !== theme) } })} />{label}</label>)}</div></fieldset>
        <details className="cr22-journey__preferences"><summary>AI가 해석한 선호 (참고)</summary><p>일정에는 선택한 관심 테마가 반영됩니다.</p><dl>{PREFERENCE_OPTIONS.filter(([key]) => hasValue(values.preferences[key])).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{values.preferences[key]} / 5</dd></div>)}</dl></details>
        <p className="cr22-journey__input-explanation"><ConsumerIcon name="info" size={18} /> 확인한 장소와 실제 이동·대여소 정보를 바탕으로 일정을 만듭니다.</p>
        {notice ? <p className="cr22-journey__notice" role="alert">{notice}</p> : null}
        {authRequired ? <ConsumerButton onClick={onLogin}>다시 로그인</ConsumerButton> : null}
        {factualDecision ? <ConsumerButton variant="secondary" disabled={working} onClick={() => { onResult?.(factualDecision); onNavigate?.("journey-result", factualDecision.decisionId); }}>확보된 실제 근거 보기</ConsumerButton> : null}
        <div className="cr22-journey__input-actions"><ConsumerButton variant="secondary" disabled={working} onClick={() => { setStage("INPUT"); setNotice(""); setErrors({}); setDecision(null); setFactualDecision(null); }}>설명 다시 입력</ConsumerButton><ConsumerButton type="submit" loading={working} loadingLabel="AI가 일정을 만드는 중…">확인하고 일정 만들기</ConsumerButton></div>
      </form>}
    </ConsumerContainer>
  </ConsumerR2Theme>;
}
