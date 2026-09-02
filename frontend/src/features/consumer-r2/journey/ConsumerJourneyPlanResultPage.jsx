import { useEffect, useMemo, useState } from "react";
import {
  AsyncState,
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
  MapShell,
  StatusBadge,
  SurfaceCard,
} from "../shared";
import { consumerJourneyAdapter, hasValue } from "../adapters/journey";
import "./journey.css";

const SEGMENT_COPY = {
  ACCESS: ["대여소까지 이동", "ACCESS", "transit"],
  RENT: ["따릉이 대여", "RENT", "bike"],
  RIDE: ["자전거 이동", "RIDE", "ride"],
  VISIT: ["장소 방문", "VISIT", "mapPin"],
};

const ERROR_COPY = {
  PREMIUM_REQUIRED: "현재 조건으로 다시 계획하려면 Premium 활성 계정이 필요합니다.",
  PREMIUM_ENTITLEMENT_UNAVAILABLE: "Premium 상태를 지금 확인할 수 없습니다.",
  JOURNEY_REVISION_CONFLICT: "다른 재계획 결과가 있습니다. 최신 계획을 다시 불러와 주세요.",
  SAVED_ROUTE_LIMIT_REACHED: "저장한 AI 계획은 최대 10개입니다.",
  IDEMPOTENCY_CONFLICT: "같은 저장 요청이 충돌했습니다. 잠시 후 다시 시도해 주세요.",
};

const THEME_OPTIONS = [
  ["PARK", "공원"], ["RIVER", "한강·하천"], ["CAFE", "카페"],
  ["ATTRACTION", "명소"], ["CULTURE", "문화"], ["FOOD", "음식"],
];

const ROUTE_MODE_OPTIONS = [
  ["BIKE_ONLY", "자전거 우선"], ["ACCESSIBLE", "접근성 우선"], ["SHORTEST", "최단 거리"],
];

function present(value, formatter = String) {
  return hasValue(value) ? formatter(value) : "확인되지 않음";
}

function formatDuration(seconds) {
  return present(seconds, (value) => `${Math.round(Number(value) / 60)}분`);
}

function formatDistance(meters) {
  return present(meters, (value) => Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}km` : `${Number(value)}m`);
}

function formatProbability(value) {
  return present(value, (raw) => { const numeric = Number(raw); return `${Number(((numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric)).toFixed(1))}%`; });
}

function formatTime(value) {
  if (!value) return "확인되지 않음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인되지 않음";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function toLocalInput(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function evidenceEntries(evidence = {}) {
  return Object.entries(evidence).flatMap(([kind, values]) => Object.values(values || {}).map((item) => ({ ...item, kind })));
}

function evidenceById(evidence = {}, id) {
  if (!id) return null;
  return evidenceEntries(evidence).find((item) => item.evidenceId === id) || null;
}

function evidenceTitle(item) {
  return item?.textFacts?.displayName || item?.textFacts?.stationName || item?.textFacts?.name || item?.evidenceId || "근거 없음";
}

function segmentTitle(segment, evidence, intent) {
  if (segment.type === "RENT" && segment.rentalFacts?.stationName) return segment.rentalFacts.stationName;
  const from = evidenceById(evidence, segment.fromEvidenceId);
  const to = evidenceById(evidence, segment.toEvidenceId);
  if (segment.type === "ACCESS") return `${intent?.origin?.displayName || evidenceTitle(from)} → ${segment.rentalFacts?.stationName || evidenceTitle(to)}`;
  if (segment.type === "RIDE") return `${evidenceTitle(from)} → ${evidenceTitle(to)}`;
  return evidenceTitle(to || from);
}

function Summary({ plan }) {
  const segments = plan.segments || [];
  const durations = segments.map((segment) => segment.durationSeconds).filter(hasValue);
  const distances = segments.map((segment) => segment.distanceMeters).filter(hasValue);
  const rent = segments.find((segment) => segment.type === "RENT")?.rentalFacts;
  const totalDuration = durations.length ? durations.reduce((sum, value) => sum + Number(value), 0) : null;
  const totalDistance = distances.length ? distances.reduce((sum, value) => sum + Number(value), 0) : null;
  return <section className="cr22-journey__result-summary" aria-labelledby="result-summary-title">
    <h2 id="result-summary-title"><ConsumerIcon name="check" size={19} /> 전체 일정 요약</h2>
    <div>
      <p><span>구간 시간 합계</span><strong>{formatDuration(totalDuration)}</strong></p>
      <p><span>구간 거리 합계</span><strong>{formatDistance(totalDistance)}</strong></p>
      <p><span>선택 대여소</span><strong>{present(rent?.stationName)}</strong></p>
      <p><span>대여 가능성</span><strong>{formatProbability(rent?.rentalProbability)}</strong></p>
    </div>
  </section>;
}

function Timeline({ intent, plan }) {
  return <section className="cr22-journey__timeline" aria-labelledby="timeline-title">
    <h2 id="timeline-title">시간순 일정 <small>백엔드 제공 구간</small></h2>
    {plan.segments?.length ? <ol>{plan.segments.map((segment) => {
      const [label, code, icon] = SEGMENT_COPY[segment.type] || [segment.type, segment.type, "info"];
      const fromEvidence = evidenceById(plan.evidence, segment.fromEvidenceId);
      const toEvidence = evidenceById(plan.evidence, segment.toEvidenceId);
      return <li className={`is-${String(segment.type).toLowerCase()}`} key={segment.segmentId}>
        <div className="cr22-journey__time"><strong>{formatTime(segment.startAt)}</strong>{segment.endAt ? <span>– {formatTime(segment.endAt)}</span> : null}<StatusBadge tone={segment.type === "VISIT" ? "premium" : segment.type === "ACCESS" ? "info" : "positive"}>{code}</StatusBadge></div>
        <article><span className="cr22-journey__segment-icon" aria-hidden="true"><ConsumerIcon name={icon} /></span><div><h3>{segmentTitle(segment, plan.evidence, intent)}</h3><p>{label}</p><div className="cr22-journey__facts"><span>시간 {formatDuration(segment.durationSeconds ?? (hasValue(segment.stayMinutes) ? Number(segment.stayMinutes) * 60 : null))}</span><span>거리 {formatDistance(segment.distanceMeters)}</span>{segment.travelMode ? <span>이동 {segment.travelMode}</span> : null}</div>{segment.type === "RENT" ? <div className="cr22-journey__rental-facts"><span>필요 {present(segment.rentalFacts?.requiredBikeCount, (value) => `${value}대`)}</span><span>현재 {present(segment.rentalFacts?.availableBikeCount, (value) => `${value}대`)}</span><span>가능성 {formatProbability(segment.rentalFacts?.rentalProbability)}</span></div> : null}<small className="cr22-journey__source">근거 ID: {[segment.fromEvidenceId, segment.toEvidenceId].filter(Boolean).join(" → ") || "확인되지 않음"}<br />출처: {[fromEvidence?.source, toEvidence?.source].filter(Boolean).join(" · ") || "확인되지 않음"}</small></div></article>
      </li>;
    })}</ol> : <AsyncState state="empty" title="표시할 일정 구간이 없습니다" description="백엔드가 제공한 구간이 없어 시간이나 경로를 만들지 않았습니다." />}
  </section>;
}

function EvidenceMap({ plan }) {
  const points = (plan.segments || []).flatMap((segment) => segment.pathPoints || []).filter((point) => hasValue(point.latitude) && hasValue(point.longitude));
  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const latitudes = points.map((point) => Number(point.latitude));
    const longitudes = points.map((point) => Number(point.longitude));
    const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes); const minLng = Math.min(...longitudes); const maxLng = Math.max(...longitudes);
    const latRange = maxLat - minLat || 1; const lngRange = maxLng - minLng || 1;
    return points.map((point) => ({ x: 8 + ((Number(point.longitude) - minLng) / lngRange) * 84, y: 92 - ((Number(point.latitude) - minLat) / latRange) * 84 }));
  }, [points]);
  const legend = <div className="cr22-journey__map-legend">{Object.entries(SEGMENT_COPY).map(([type, [, label]]) => <span key={type}><i className={`is-${type.toLowerCase()}`} />{label}</span>)}</div>;
  return <MapShell ariaLabel="실제 pathPoints 기반 여정 경로" legend={chart ? legend : null} footer={<p className="cr22-journey__map-note"><ConsumerIcon name="info" size={16} /> 실제 응답의 pathPoints만 단순 도식화했습니다.</p>}>
    {chart ? <svg className="cr22-journey__route-plot" viewBox="0 0 100 100" role="img" aria-label={`${chart.length}개 실제 좌표로 구성된 여정 경로`} preserveAspectRatio="none"><defs><pattern id="journey-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d8e5e4" strokeWidth="0.25" /></pattern></defs><rect width="100" height="100" fill="url(#journey-grid)" /><polyline points={chart.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#008a76" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />{chart.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={index === 0 || index === chart.length - 1 ? 2.2 : 1.2} fill={index === 0 ? "#0969e8" : index === chart.length - 1 ? "#7137d6" : "#008a76"} stroke="#fff" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />)}</svg> : <AsyncState state={plan.status === "PARTIAL" ? "partial" : "empty"} title="확인된 경로 좌표가 없습니다" description="실제 pathPoints가 없어 지도 경로나 거리를 추정해서 표시하지 않습니다." />}
  </MapShell>;
}

function Rationale({ plan }) {
  const items = evidenceEntries(plan.evidence);
  const usedRefs = new Set((plan.segments || []).flatMap((segment) => [segment.fromEvidenceId, segment.toEvidenceId]).filter(Boolean));
  if (plan.selectedRentalCandidateId) usedRefs.add(plan.selectedRentalCandidateId);
  return <SurfaceCard title="AI 추천 이유와 근거 번들">
    <p className="cr22-journey__rationale">{plan.rationale || "AI 추천 이유가 제공되지 않았습니다."}</p>
    {plan.rationaleTags?.length ? <div className="cr22-journey__tag-row">{plan.rationaleTags.map((tag) => <StatusBadge key={tag} tone="info">{tag}</StatusBadge>)}</div> : null}
    <div className="cr22-journey__evidence-list" aria-label="근거 번들 상태">{items.length ? items.map((item) => <p key={`${item.kind}-${item.evidenceId}`}><span><strong>{item.source}</strong><small>{item.evidenceId} · {item.kind} · {usedRefs.has(item.evidenceId) ? "구간 endpoint 참조" : "근거 번들"}</small></span><StatusBadge tone={item.status === "NORMAL" ? "positive" : item.status === "UNAVAILABLE" || item.status === "MISSING" ? "danger" : "caution"}>{item.status}</StatusBadge></p>) : <p><span><strong>근거 목록 없음</strong><small>UNAVAILABLE</small></span><StatusBadge tone="danger">UNAVAILABLE</StatusBadge></p>}</div>
    <p className="cr22-journey__muted">PARTIAL·MISSING·UNAVAILABLE은 정상 근거와 구분해 그대로 표시합니다.</p>
  </SurfaceCard>;
}

function ResultContent({ adapter, decision, onNavigate, onUpdated }) {
  const plan = decision.unifiedPlan;
  const intent = decision.normalizedIntent || {};
  const constraints = intent.constraints || {};
  const [editor, setEditor] = useState({
    availableMinutes: String(constraints.availableMinutes ?? intent.maxJourneyMinutes ?? intent.totalMinutes ?? 60),
    themes: constraints.themes || [],
    stopCount: String(constraints.stopCount ?? 1),
    routeMode: constraints.routeMode || "BIKE_ONLY",
  });
  const [action, setAction] = useState("");
  const [notice, setNotice] = useState("");

  async function replan() {
    const availableMinutes = Number(editor.availableMinutes);
    const stopCount = Number(editor.stopCount);
    if (!Number.isInteger(availableMinutes) || availableMinutes < 1 || availableMinutes > 480 || !Number.isInteger(stopCount) || stopCount < 1 || stopCount > 3) {
      setNotice("이용 시간은 1~480분, 방문 장소는 1~3곳으로 선택해 주세요.");
      return;
    }
    setAction("replan"); setNotice("");
    try { const next = await adapter.replan(decision, { constraints: { availableMinutes, themes: editor.themes, stopCount, routeMode: editor.routeMode } }); onUpdated(next); }
    catch (error) { setNotice(ERROR_COPY[error.code] || "현재 조건으로 다시 계획하지 못했습니다."); }
    finally { setAction(""); }
  }
  async function save() {
    setAction("save"); setNotice("");
    try { await adapter.saveCurrentConditions(decision); setNotice("현재 계획의 재실행 입력을 저장했습니다. 다시 열 때는 최신 근거로 새 계획을 만듭니다."); }
    catch (error) { setNotice(ERROR_COPY[error.code] || "현재 조건을 저장하지 못했습니다."); }
    finally { setAction(""); }
  }
  const origin = intent.origin?.displayName;
  const destination = intent.destination?.displayName;
  const title = [origin, destination].filter(Boolean).join(" → ") || "AI 라이딩 계획";
  if (!plan) return <AsyncState state="partial" title="통합 일정을 표시할 수 없습니다" description="백엔드가 통합 일정이나 근거를 제공하지 않았습니다." onAction={() => onNavigate?.("planner")} actionLabel="조건 다시 입력" />;
  return <>
    <div className="cr22-journey__result-title"><div><p className="cr22-journey__breadcrumb"><ConsumerIcon name="home" size={15} /> <span aria-hidden="true">›</span> AI 플래너 <span aria-hidden="true">›</span> 결과</p><h1>{title} <StatusBadge tone="premium">PREMIUM</StatusBadge></h1><p>실제 대여·장소·경로 근거로 구성된 현재 계획입니다.</p></div><div><ConsumerButton variant="secondary" icon={<ConsumerIcon name="retry" />} onClick={() => document.getElementById("structured-replan")?.scrollIntoView()}>조건 변경 후 재추천</ConsumerButton><ConsumerButton icon={<ConsumerIcon name="plan" />} loading={action === "save"} loadingLabel="저장 중…" onClick={save}>이 계획 저장</ConsumerButton></div></div>
    {plan.status === "PARTIAL" || decision.status === "PARTIAL" ? <p className="cr22-journey__partial" role="status"><StatusBadge tone="caution">PARTIAL</StatusBadge> 일부 근거만 확인되었습니다. 확인되지 않은 값은 따로 표시합니다.</p> : null}
    {plan.status === "UNAVAILABLE" || decision.status === "UNAVAILABLE" ? <p className="cr22-journey__partial" role="status"><StatusBadge tone="danger">UNAVAILABLE</StatusBadge> 전체 일정은 만들지 못했습니다. 아래에는 백엔드가 제공한 사실 구간과 근거만 표시합니다.</p> : null}
    <div className="cr22-journey__result-layout"><div><Summary plan={plan} /><Timeline intent={intent} plan={plan} /></div><aside><EvidenceMap plan={plan} /><Rationale plan={plan} /></aside></div>
    <SurfaceCard title="구조화 조건으로 다시 계획">
      <div className="cr22-journey__replan" id="structured-replan">
        <label>이용 시간<input name="availableMinutes" autoComplete="off" type="number" min="1" max="480" value={editor.availableMinutes} onChange={(event) => setEditor((current) => ({ ...current, availableMinutes: event.target.value }))} /></label>
        <fieldset className="cr22-journey__theme-field"><legend>테마</legend><div>{THEME_OPTIONS.map(([value, label]) => <label key={value}><input name="themes" type="checkbox" value={value} checked={editor.themes.includes(value)} onChange={(event) => setEditor((current) => ({ ...current, themes: event.target.checked ? [...current.themes, value] : current.themes.filter((item) => item !== value) }))} />{label}</label>)}</div></fieldset>
        <label>방문 장소 수<select name="stopCount" autoComplete="off" value={editor.stopCount} onChange={(event) => setEditor((current) => ({ ...current, stopCount: event.target.value }))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value}곳</option>)}</select></label>
        <label>경로 방식<select name="routeMode" autoComplete="off" value={editor.routeMode} onChange={(event) => setEditor((current) => ({ ...current, routeMode: event.target.value }))}>{ROUTE_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <ConsumerButton loading={action === "replan"} loadingLabel="현재 근거 확인 중…" onClick={replan}>현재 근거로 다시 계획</ConsumerButton>
      </div>
      <p className="cr22-journey__muted">재계획은 자연어를 다시 보내지 않고 이용 시간·테마·방문 장소 수·경로 방식만 구조화해서 전송합니다.</p>{notice ? <p className="cr22-journey__notice" role="status">{notice}</p> : null}
    </SurfaceCard>
  </>;
}

export default function ConsumerJourneyPlanResultPage({ adapter = consumerJourneyAdapter, authState = "authenticated", decisionId, initialDecision, onLogin, onNavigate, user }) {
  const [state, setState] = useState(initialDecision ? { type: "ready", decision: initialDecision } : { type: "loading" });
  async function load() { setState({ type: "loading" }); try { setState({ type: "ready", decision: await adapter.loadDecision(decisionId) }); } catch (error) { setState({ type: "error", error }); } }
  useEffect(() => { if (!initialDecision) load(); }, [decisionId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ConsumerR2Theme className="cr22-journey">
    <ConsumerAppHeader activeItem="planner" authState={authState} hasUnreadNotifications onLogin={onLogin} onNavigate={onNavigate} userName={user?.name || user?.displayName} userTier={user?.tier} />
    <ConsumerContainer as="main" id="main-content" className="cr22-journey__content">
      {state.type === "loading" ? <AsyncState state="loading" title="AI 계획을 불러오는 중입니다" description="저장된 decision과 현재 근거 상태를 확인하고 있습니다." /> : null}
      {state.type === "error" ? <AsyncState state="error" title={state.error?.status === 410 ? "AI 계획이 만료되었습니다" : state.error?.status === 404 ? "AI 계획을 찾을 수 없습니다" : "AI 계획을 불러오지 못했습니다"} description={ERROR_COPY[state.error?.code] || "조건을 다시 입력하거나 잠시 후 다시 시도해 주세요."} onAction={load} /> : null}
      {state.type === "ready" ? <ResultContent adapter={adapter} decision={state.decision} onNavigate={onNavigate} onUpdated={(decision) => setState({ type: "ready", decision })} /> : null}
    </ConsumerContainer>
  </ConsumerR2Theme>;
}
