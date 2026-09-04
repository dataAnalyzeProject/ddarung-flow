import { useEffect, useRef, useState } from "react";
import heroImage from "../../../assets/consumer-r2/main/cr22-main-initial-hero-v1.webp";
import { fetchRouteCandidates } from "../../map/candidatesApi.js";
import { searchPlaces } from "../../map/kakaoMapApi.js";
import { getCurrentUser } from "../../login/authApi.js";
import { clearPendingPrediction, loadPendingPrediction } from "../../login/loginStorage.js";
import { adaptConsumerMainResponse, buildConsumerMainRequest } from "../adapters/main/index.js";
import { restoreConsumerMainInput, saveConsumerMainPendingPrediction, toConsumerMainSearchInput } from "../adapters/main/consumerMainState.js";
import { consumerPersonalAdapter } from "../adapters/personal/consumerPersonalAdapter.js";
import { consumerSupportAdapter } from "../adapters/support/consumerSupportAdapter.js";
import ConsumerAppHeader from "../shared/ConsumerAppHeader.jsx";
import ConsumerIcon from "../shared/ConsumerIcon.jsx";
import { ConsumerButton, OptionCard, SelectedPlaceCard, StatusBadge } from "../shared/ConsumerControls.jsx";
import { AsyncState } from "../shared/ConsumerSurfaces.jsx";
import { ConsumerContainer, ConsumerR2Theme } from "../shared/ConsumerR2Layout.jsx";
import ConsumerRouteMap from "./ConsumerRouteMap.jsx";
import RecheckOptInDialog from "../support/RecheckOptInDialog.jsx";
import walkIllustration from "../../../assets/consumer-r2/main/cr22-main-walk-v1.webp";
import "./main.css";
import "../support/support.css";

const DEFAULT_SERVICES = {
  clearPendingPrediction,
  fetchRouteCandidates,
  getCurrentUser,
  loadPendingPrediction,
  savePendingPrediction: saveConsumerMainPendingPrediction,
  saveRecentSearch: consumerPersonalAdapter.saveRecentSearch,
  createSearchRecheck: consumerSupportAdapter.createSearchRecheck,
  searchPlaces,
};

const DEFAULT_INPUT = { origin: "", destination: "", travelMode: "PUBLIC_TRANSIT", requiredBikeCount: 1 };

function inputSnapshot(input, places) {
  const restored = restoreConsumerMainInput({ ...input, routePlaces: places });
  const placeOrQuery = (kind) => {
    const place = restored.places[kind];
    return place ? {
      providerId: place.providerId,
      displayName: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    } : restored.input[kind];
  };
  return { ...restored.input, origin: placeOrQuery("origin"), destination: placeOrQuery("destination") };
}

function formatProbability(value) {
  return value === null ? "확인 불가" : `${Math.round(value * 100)}%`;
}

function formatMinutes(seconds) {
  return seconds === null ? "시간 확인 불가" : `약 ${Math.round(seconds / 60)}분`;
}

function formatDateTime(value) {
  if (!value) return "시각 확인 불가";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시각 확인 불가";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatFare(fare) {
  return fare === null ? "요금 확인 불가" : `${new Intl.NumberFormat("ko-KR").format(fare)}원`;
}

function getInventoryPresentation(candidate) {
  const status = candidate.inventoryStatus;
  if (candidate.availableBikeCount === null || status === "MISSING" || status === "UNAVAILABLE") {
    const detail = status || "상태 확인 불가";
    return { value: "확인 불가", detail, inline: `현재 재고 확인 불가 · ${detail}` };
  }
  const statusLabel = status === "DELAYED" ? "지연 데이터" : status === "NORMAL" ? "정상" : (status || "상태 확인 불가");
  const detail = `${statusLabel} · ${formatDateTime(candidate.inventoryCollectedAt)} 기준`;
  return { value: `${candidate.availableBikeCount}대`, detail, inline: `현재 ${candidate.availableBikeCount}대 · ${detail}` };
}

function formatInventory(candidate) {
  return getInventoryPresentation(candidate).inline;
}

function formatDistance(meters) {
  if (meters === null) return "거리 확인 불가";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

function formatArrival(arrivalAt) {
  if (!arrivalAt) return "도착 시각 확인 불가";
  const date = new Date(arrivalAt);
  if (Number.isNaN(date.getTime())) return "도착 시각 확인 불가";
  return `${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)} 도착`;
}

function PlacePicker({ kind, label, onSelect, place, query, search, setQuery }) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const requestRef = useRef(0);

  useEffect(() => {
    if (place || query.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return undefined;
    }
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await search(query.trim());
        if (requestRef.current !== requestId) return;
        const places = response?.places ?? [];
        setResults(places);
        setStatus(places.length ? "success" : "empty");
      } catch {
        if (requestRef.current === requestId) setStatus("error");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [place, query, search]);

  if (place) {
    return (
      <div className="cr293-place-picker">
        <p className="cr293-place-picker__label">{label}</p>
        <SelectedPlaceCard kind={kind} title={place.name} meta={<><span className="cr293-place-provider" aria-hidden="true">kakao</span><span>{place.address || "Kakao 장소 선택 완료"}</span></>} onReselect={() => { onSelect(null); setQuery(place.name); }} />
      </div>
    );
  }

  return (
    <div className="cr293-place-picker">
      <label htmlFor={`cr293-${kind}`}>{label}</label>
      <span className="cr293-place-picker__input">
        <ConsumerIcon name="mapPin" size={20} />
        <input id={`cr293-${kind}`} name={`${kind}Place`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 서울역…" autoComplete="off" />
      </span>
      {query.trim().length >= 2 ? (
        <div className="cr293-place-picker__results" role="region" aria-label={`${label} 검색 결과`}>
          {status === "loading" ? <p role="status">장소를 찾고 있습니다.</p> : null}
          {status === "empty" ? <p>검색 결과가 없습니다.</p> : null}
          {status === "error" ? <p role="alert">장소 검색에 실패했습니다. 다시 입력해 주세요.</p> : null}
          {results.map((result) => (
            <button key={result.placeId ?? `${result.name}-${result.latitude}`} type="button" onClick={() => { onSelect(result); setQuery(result.name); }}>
              <strong>{result.name}</strong><span>{result.address || "주소 정보 없음"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchWorkspace({ authState, input, onChange, onOpenPlanner, onSearch, places, searchPlaces, state }) {
  const ready = Boolean(places.origin && places.destination);
  return (
    <section className="cr293-search" aria-labelledby="cr293-search-title">
      <h2 className="cr293-search__title" id="cr293-search-title">대여 가능성 비교 조건</h2>
      <div className="cr293-search__steps">
        <div className="cr293-search__step">
          <span className="cr293-step-number">1</span>
          <PlacePicker kind="origin" label="어디에서 출발하나요?" place={places.origin} query={input.origin} setQuery={(origin) => onChange({ origin })} onSelect={(origin) => onChange({ origin: origin?.name ?? input.origin, originPlace: origin })} search={searchPlaces} />
        </div>
        <div className="cr293-search__step">
          <span className="cr293-step-number">2</span>
          <PlacePicker kind="destination" label="어디 근처에서 빌리고 싶나요?" place={places.destination} query={input.destination} setQuery={(destination) => onChange({ destination })} onSelect={(destination) => onChange({ destination: destination?.name ?? input.destination, destinationPlace: destination })} search={searchPlaces} />
          <p className="cr293-search__step-help"><ConsumerIcon name="info" size={16} /> 라이딩의 최종 목적지가 아닙니다.<br /><span>대여 희망 지역을 선택해주세요.</span></p>
        </div>
        <div className="cr293-search__step" role="group" aria-labelledby="cr293-step-travel-label">
          <p className="cr293-search__step-label" id="cr293-step-travel-label"><span className="cr293-step-number">3</span><span>대여소까지<br />어떻게 이동하나요?</span></p>
          <div className="cr293-options cr293-options--travel">
            <OptionCard icon={<img className="cr293-walk-illustration" src={walkIllustration} alt="" aria-hidden="true" width="256" height="256" />} title="도보" selected={input.travelMode === "WALK"} onSelect={() => onChange({ travelMode: "WALK" })} />
            <OptionCard icon={<ConsumerIcon name="transit" />} title="대중교통" selected={input.travelMode === "PUBLIC_TRANSIT"} onSelect={() => onChange({ travelMode: "PUBLIC_TRANSIT" })} />
          </div>
          <p className="cr293-search__step-help"><ConsumerIcon name="info" size={16} /> 이동 수단에 따라 예상 이동시간이 달라져요.</p>
        </div>
        <div className="cr293-search__step" role="group" aria-labelledby="cr293-step-bike-label">
          <p className="cr293-search__step-label" id="cr293-step-bike-label"><span className="cr293-step-number">4</span> 몇 대가 필요한가요?</p>
          <div className="cr293-bike-count">
            {[1, 2, 3, 4, 5].map((count) => <button key={count} type="button" aria-pressed={input.requiredBikeCount === count} onClick={() => onChange({ requiredBikeCount: count })}>{count}대</button>)}
          </div>
        </div>
      </div>
      <div className="cr293-search__actions">
        <ConsumerButton className="cr293-search__compare" block size="lg" icon={<ConsumerIcon name="arrowRight" />} iconPosition="end" disabled={!ready || state === "LOADING" || authState === "loading" || authState === "error"} loading={state === "LOADING"} loadingLabel="도착 시점 후보를 찾는 중…" onClick={onSearch}><ConsumerIcon name="bike" /> 대여 가능성 비교</ConsumerButton>
        <ConsumerButton className="cr293-search__planner" block size="lg" variant="premium" icon={<ConsumerIcon name="arrowRight" />} iconPosition="end" disabled={state === "LOADING"} onClick={onOpenPlanner}><span className="cr293-search__planner-label"><span className="cr293-search__sparkles" aria-hidden="true">✦</span><span>AI로 전체 일정 짜기</span><b>PREMIUM</b></span></ConsumerButton>
      </div>
      {state === "LOADING" ? <div className="cr293-search__loading"><AsyncState state="loading" title="도착 시점 후보를 비교하고 있습니다" description="예측과 실제 이동 경로를 같은 근거로 확인합니다." /></div> : null}
      <p className="cr293-search__hint"><span aria-hidden="true">✧</span> AI가 추천 코스와 대여소를 포함한 라이딩 일정을 제안해드려요.</p>
      {!ready ? <p className="cr293-search__selection-hint">출발 위치와 대여 희망 지역을 검색 결과에서 각각 선택해 주세요.</p> : null}
    </section>
  );
}

function CandidateCard({ candidate, index, onSelect, selected }) {
  const tone = candidate.availabilityLevel === "HIGH" ? "success" : candidate.availabilityLevel === "MEDIUM" ? "warning" : "danger";
  const unavailable = candidate.predictionStatus !== "NORMAL" || candidate.routeStatus !== "NORMAL";
  return (
    <button className="cr293-candidate" type="button" aria-pressed={selected} onClick={() => onSelect(candidate.stationId)}>
      <span className="cr293-candidate__rank">{index + 1}</span>
      <span className="cr293-candidate__body">
        <span className="cr293-candidate__top"><strong>{candidate.stationName}</strong><StatusBadge tone={unavailable ? "neutral" : tone}>{candidate.availabilityLabel}</StatusBadge></span>
        <span className="cr293-candidate__metric"><b>{formatProbability(candidate.probability)}</b><small>대여 가능성</small></span>
        <span className="cr293-candidate__meta">{formatMinutes(candidate.durationSeconds)} · {formatDistance(candidate.distanceMeters)} · {formatArrival(candidate.arrivalAt)}</span>
        <span className="cr293-candidate__inventory">{formatInventory(candidate)}</span>
        {unavailable ? <span className="cr293-candidate__unavailable">예측 또는 경로 근거를 확인할 수 없습니다.</span> : null}
      </span>
    </button>
  );
}

function RouteDetail({ candidate }) {
  const detail = candidate.routeDetail;
  return (
    <section className="cr293-transit" aria-labelledby="cr293-transit-title">
      <div className="cr293-transit__header">
        <div><h2 id="cr293-transit-title">{candidate.stationName}까지 가는 길</h2></div>
        <div><strong>{formatMinutes(detail.durationSeconds)}</strong><span>{formatDistance(detail.distanceMeters)} · 환승 {detail.transfers ?? "확인 불가"}회 · {formatFare(detail.fare)}</span></div>
      </div>
      {detail.steps.length ? <ol className="cr293-transit__steps">
        {detail.steps.map((step, index) => (
          <li key={`${step.type}-${index}`}>
            <span className="cr293-transit__dot" aria-hidden="true"><ConsumerIcon name={step.type === "SUBWAY" || step.type === "BUS" ? "transit" : "ride"} size={18} /></span>
            <div><strong>{step.guidance || "이동 안내"}</strong><span>{formatMinutes(step.durationSeconds)} · {formatDistance(step.distanceMeters)}</span>{step.vehicles.length ? <small>{step.vehicles.map((vehicle) => vehicle.name).filter(Boolean).join(" · ")}</small> : null}</div>
          </li>
        ))}
      </ol> : <p role="status">상세 이동 단계가 제공되지 않았습니다. 경로 요약을 확인해 주세요.</p>}
    </section>
  );
}

function TransitWorkspace({ candidate, destination, mapRenderer, onClose, onOpenRide, onOpenStation, origin, transitHeadingRef }) {
  const unavailable = candidate.predictionStatus !== "NORMAL" || candidate.routeStatus !== "NORMAL";
  const inventory = getInventoryPresentation(candidate);
  const tone = candidate.availabilityLevel === "HIGH" ? "success" : candidate.availabilityLevel === "MEDIUM" ? "warning" : "danger";
  return (
    <section className="cr293-transit-view" aria-label="선택한 대여소의 대중교통 경로 상세">
      <aside className="cr293-transit-summary">
        <div className="cr293-transit-summary__title">
          <StatusBadge tone={unavailable ? "neutral" : tone}>{unavailable ? "확인 불가" : "추천"}</StatusBadge>
          <h2 ref={transitHeadingRef} tabIndex="-1">{candidate.stationName}</h2>
        </div>
        <div className="cr293-transit-summary__primary">
          <span><small>도착 시점 대여 가능성</small>{candidate.probability === null ? <strong>확인 불가</strong> : <b>{formatProbability(candidate.probability)}</b>}</span>
          <span aria-label={inventory.inline}><small>현재 자전거</small><b>{inventory.value}</b><small className="cr293-transit-summary__meta">{inventory.detail}</small></span>
        </div>
        <div className="cr293-transit-summary__route">
          <span><small>예상 도착</small><b>{formatArrival(candidate.arrivalAt)}</b></span>
          <span><small>대중교통</small><b>{formatMinutes(candidate.durationSeconds)}</b></span>
        </div>
        <p>{candidate.probability === null ? "도착 시각은 표시된 대중교통 경로 기준이며, 대여 가능성은 현재 확인하지 못했습니다." : "도착 시각과 대여 가능성은 표시된 동일 대중교통 경로를 기준으로 계산했습니다."}</p>
      </aside>
      <div className="cr293-transit-view__route">
        <ConsumerRouteMap candidate={candidate} destination={destination} mapRenderer={mapRenderer} origin={origin} />
        <div id="cr293-transit-detail"><RouteDetail candidate={candidate} /></div>
        <div className="cr293-transit-view__actions">
          <ConsumerButton variant="secondary" aria-controls="cr293-transit-detail" aria-expanded="true" onClick={onClose}>경로 상세 닫기</ConsumerButton>
          <ConsumerButton variant="secondary" onClick={() => onOpenStation?.(candidate)}>대여소 상세</ConsumerButton>
          <ConsumerButton onClick={() => onOpenRide?.(candidate)}>라이딩 둘러보기</ConsumerButton>
        </div>
      </div>
    </section>
  );
}

function ResultsWorkspace({ input, mapRenderer, onOpenRide, onOpenStation, onReset, places, result, selectedId, setSelectedId, showTransit, setShowTransit }) {
  const resultHeadingRef = useRef(null);
  const transitHeadingRef = useRef(null);
  const selected = result.candidates.find((candidate) => candidate.stationId === selectedId) ?? result.candidates[0];
  useEffect(() => {
    if (showTransit) transitHeadingRef.current?.focus();
    else resultHeadingRef.current?.focus();
  }, [showTransit]);
  return (
    <>
      {!showTransit ? (
        <section className="cr293-result-heading">
          <div><h1 ref={resultHeadingRef} tabIndex="-1">{places.destination.name} 근처 추천 결과</h1><p>선택한 이동 경로와 도착 시각을 기준으로 비교했어요.</p></div>
          <ConsumerButton variant="secondary" onClick={onReset}>조건 다시 선택</ConsumerButton>
        </section>
      ) : null}
      <section className="cr293-condition" aria-label="선택 조건">
        <span><ConsumerIcon name="mapPin" size={18} /> {places.origin.name} → {places.destination.name}</span>
        <span><ConsumerIcon name={input.travelMode === "PUBLIC_TRANSIT" ? "transit" : "ride"} size={18} /> {input.travelMode === "PUBLIC_TRANSIT" ? "대중교통" : "도보"}</span>
        <span><ConsumerIcon name="bike" size={18} /> {input.requiredBikeCount}대 필요</span>
      </section>
      {result.viewState === "PARTIAL" ? <AsyncState state="partial" title="일부 후보의 근거를 확인하지 못했습니다" description="확인된 후보는 그대로 비교하고, 확인 불가 값은 0으로 표시하지 않았습니다." /> : null}
      {showTransit && selected.routeDetail ? (
        <TransitWorkspace candidate={selected} destination={places.destination} mapRenderer={mapRenderer} onClose={() => setShowTransit(false)} onOpenRide={onOpenRide} onOpenStation={onOpenStation} origin={places.origin} transitHeadingRef={transitHeadingRef} />
      ) : (
        <section className="cr293-results" aria-label="대여소 추천 결과" aria-live="polite">
        <div className="cr293-results__list">
          <div className="cr293-results__title"><div><h2>추천 대여소</h2></div><span>{result.candidates.length}곳</span></div>
          {result.candidates.map((candidate, index) => <CandidateCard key={candidate.stationId ?? index} candidate={candidate} index={index} selected={selected?.stationId === candidate.stationId} onSelect={(stationId) => { setSelectedId(stationId); setShowTransit(false); }} />)}
        </div>
        <div className="cr293-results__map">
          {selected?.routeDetail ? <ConsumerRouteMap candidate={selected} destination={places.destination} mapRenderer={mapRenderer} origin={places.origin} /> : <div className="cr293-route-unavailable" role="status"><ConsumerIcon name="info" /><strong>선택한 후보의 경로를 확인할 수 없습니다.</strong><span>다른 후보를 선택해 주세요.</span></div>}
          <section className="cr293-evidence">
            <div><h2>선택한 경로: {selected.stationName}</h2></div>
            <div className="cr293-evidence__numbers"><span><b>{formatProbability(selected.probability)}</b><small>대여 가능성</small></span><span><b>{formatMinutes(selected.durationSeconds)}</b><small>예상 이동</small></span><span><b>{formatArrival(selected.arrivalAt)}</b><small>예상 도착</small></span></div>
            <dl className="cr293-evidence__metadata">
              <div><dt>현재 재고</dt><dd>{formatInventory(selected)}</dd></div>
              <div><dt>예측 기준</dt><dd>{formatDateTime(selected.predictionTargetAt)} · horizon {selected.horizonMinutes === null ? "확인 불가" : `${selected.horizonMinutes}분`}</dd></div>
              <div><dt>피처 기준 / 만료</dt><dd>{formatDateTime(selected.featureAsOf)} / {formatDateTime(selected.expiresAt)}</dd></div>
            </dl>
            <div className="cr293-evidence__actions">
              {input.travelMode === "PUBLIC_TRANSIT" && selected.routeDetail ? <ConsumerButton variant="secondary" aria-controls="cr293-transit-detail" aria-expanded={showTransit} onClick={() => setShowTransit((value) => !value)}>{showTransit ? "경로 상세 닫기" : "대중교통 경로 상세"}</ConsumerButton> : null}
              <ConsumerButton variant="secondary" onClick={() => onOpenStation?.(selected)}>대여소 상세</ConsumerButton>
              <ConsumerButton onClick={() => onOpenRide?.(selected)}>라이딩 둘러보기</ConsumerButton>
            </div>
            <p>예측은 실제 대여를 보장하지 않습니다. 모든 수치는 위 경로 근거와 같은 응답에서 왔습니다.</p>
          </section>
        </div>
        </section>
      )}
    </>
  );
}

export default function ConsumerMainPage({ currentResult, mapRenderer, onInputChange, onLogin, onNavigate, onOpenRide, onOpenStation, onSearchComplete, restoreSearch, services = DEFAULT_SERVICES }) {
  const [authState, setAuthState] = useState("loading");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [user, setUser] = useState(null);
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [places, setPlaces] = useState({ origin: null, destination: null });
  const [state, setState] = useState("INITIAL");
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showTransit, setShowTransit] = useState(false);
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [recheckStatus, setRecheckStatus] = useState("idle");
  const [recentSearchError, setRecentSearchError] = useState(false);
  const requestRef = useRef(0);
  const inputRef = useRef({ input: DEFAULT_INPUT, places: { origin: null, destination: null } });
  const callbacksRef = useRef({ onInputChange, onSearchComplete });
  callbacksRef.current = { onInputChange, onSearchComplete };

  useEffect(() => {
    const restored = restoreConsumerMainInput(restoreSearch || services.loadPendingPrediction?.());
    const suppliedResult = restoreSearch && toConsumerMainSearchInput(restoreSearch, restoreSearch) && currentResult
      ? adaptConsumerMainResponse(currentResult.candidates, { requiredBikeCount: restored.input.requiredBikeCount })
      : null;
    requestRef.current += 1;
    inputRef.current = restored;
    setInput(restored.input);
    setPlaces(restored.places);
    setResult(suppliedResult);
    setSelectedId(suppliedResult?.selectedStationId ?? null);
    setState(suppliedResult?.viewState ?? "INITIAL");
    setShowTransit(false);
    setRecheckOpen(false);
    setRecheckStatus("idle");
    setRecentSearchError(false);
    callbacksRef.current.onInputChange?.(inputSnapshot(restored.input, restored.places));
  }, [currentResult, restoreSearch, services]);

  useEffect(() => {
    let active = true;
    setAuthState("loading");
    services.getCurrentUser()
      .then((auth) => {
        if (!active) return;
        const authenticated = auth?.authenticated === true && Boolean(auth.user);
        setUser(authenticated ? auth.user : null);
        setAuthState(authenticated ? "authenticated" : "anonymous");
      })
      .catch((error) => {
        if (!active) return;
        setUser(null);
        setAuthState(error?.status === 401 || error?.status === 403 ? "anonymous" : "error");
      });
    return () => { active = false; };
  }, [authAttempt, services]);

  const updateInput = (patch) => {
    requestRef.current += 1;
    if (state === "LOADING") setState("INITIAL");
    const nextPlaces = { ...inputRef.current.places };
    if (Object.prototype.hasOwnProperty.call(patch, "originPlace")) nextPlaces.origin = patch.originPlace;
    if (Object.prototype.hasOwnProperty.call(patch, "destinationPlace")) nextPlaces.destination = patch.destinationPlace;
    const { originPlace, destinationPlace, ...inputPatch } = patch;
    const nextInput = { ...inputRef.current.input, ...inputPatch };
    inputRef.current = { input: nextInput, places: nextPlaces };
    setInput(nextInput);
    setPlaces(nextPlaces);
    const snapshot = inputSnapshot(nextInput, nextPlaces);
    callbacksRef.current.onInputChange?.(snapshot);
    callbacksRef.current.onSearchComplete?.(snapshot, null);
  };

  const reset = () => {
    requestRef.current += 1;
    setState("INITIAL");
    setResult(null);
    setSelectedId(null);
    setShowTransit(false);
    setRecheckStatus("idle");
    callbacksRef.current.onSearchComplete?.(inputSnapshot(input, places), null);
  };
  const login = () => {
    services.savePendingPrediction(input, places);
    if (onLogin) onLogin(); else window.location.assign("/login");
  };
  const searchInput = toConsumerMainSearchInput(input, places);
  const submit = async () => {
    if (!searchInput || authState === "loading" || authState === "error") return;
    if (authState === "anonymous") {
      login();
      return;
    }
    const requestId = ++requestRef.current;
    setState("LOADING");
    setShowTransit(false);
    setRecheckStatus("idle");
    setRecentSearchError(false);
    try {
      const response = await services.fetchRouteCandidates(buildConsumerMainRequest({ ...input, ...places }));
      if (requestId !== requestRef.current) return;
      const adapted = adaptConsumerMainResponse(response?.candidates ?? response, { requiredBikeCount: input.requiredBikeCount });
      setResult(adapted);
      setSelectedId(adapted.selectedStationId);
      setState(adapted.viewState);
      callbacksRef.current.onSearchComplete?.(searchInput, response);
      services.clearPendingPrediction?.();
      try {
        services.saveRecentSearch?.(user, searchInput);
      } catch {
        setRecentSearchError(true);
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      if (error?.message === "AUTH_REQUIRED" || error?.status === 401 || error?.status === 403) {
        setUser(null);
        setAuthState("anonymous");
        setState("INITIAL");
        login();
        return;
      }
      setState("ERROR");
    }
  };

  const createRecheck = async (departureAt) => {
    if (!searchInput || recheckStatus === "saving") return;
    setRecheckStatus("saving");
    try {
      await services.createSearchRecheck(searchInput, departureAt);
      setRecheckStatus("success");
    } catch (error) {
      setRecheckStatus("error");
      if (error?.status === 401 || error?.status === 403) login();
    }
    setRecheckOpen(false);
  };

  let content;
  if (state === "INITIAL" || state === "LOADING") content = <SearchWorkspace authState={authState} input={input} onChange={updateInput} onOpenPlanner={() => onNavigate?.("planner")} onSearch={submit} places={places} searchPlaces={services.searchPlaces} state={state} />;
  else if (state === "ERROR") content = <AsyncState state="error" title="추천 결과를 불러오지 못했습니다" description="입력은 그대로 보존했습니다. 잠시 후 다시 시도해 주세요." onAction={submit} />;
  else if (state === "EMPTY") content = <AsyncState state="empty" title="조건에 맞는 대여소를 찾지 못했습니다" description="확인 불가 값을 0으로 바꾸지 않았습니다. 조건을 바꿔 다시 찾아보세요." actionLabel="조건 다시 선택" onAction={reset} />;
  else content = <ResultsWorkspace input={input} mapRenderer={mapRenderer} onOpenRide={(candidate) => onOpenRide?.(candidate, searchInput)} onOpenStation={(candidate) => onOpenStation?.(candidate, searchInput)} onReset={reset} places={places} result={result} selectedId={selectedId} setSelectedId={setSelectedId} showTransit={showTransit} setShowTransit={setShowTransit} />;

  return (
    <ConsumerR2Theme className="cr293-page">
      <ConsumerAppHeader activeItem="ride" authState={authState} onLogin={login} onNavigate={onNavigate} userName={user?.displayName ?? user?.name} userTier={user?.tier?.toLowerCase()} />
      <main id="main-content">
        {state === "INITIAL" || state === "LOADING" ? <section className="cr293-hero"><img src={heroImage} alt="서울 도심에서 따릉이를 타고 이동하는 모습" width="1600" height="420" fetchpriority="high" /><div><h1>도착할 때 빌릴 수 있는<br />대여소를 비교해요</h1><p>현재 출발 기준으로 대여 희망 지역 주변 대여소까지의 이동시간을 반영합니다.</p></div></section> : null}
        <ConsumerContainer className={state === "INITIAL" || state === "LOADING" ? "cr293-container--initial" : "cr293-container--result"}>
          {authState === "error" ? <AsyncState state="error" title="로그인 상태를 확인하지 못했습니다" description="입력한 조건은 유지됩니다. 연결을 확인한 뒤 다시 시도해 주세요." actionLabel="로그인 상태 다시 확인" onAction={() => setAuthAttempt((value) => value + 1)} /> : null}
          {content}
          {(state === "RESULT" || state === "PARTIAL") && searchInput ? <ConsumerButton variant="secondary" disabled={authState !== "authenticated" || recheckStatus === "saving"} onClick={() => { setRecheckStatus("idle"); setRecheckOpen(true); }}>출발 전에 다시 알려주세요</ConsumerButton> : null}
          {recentSearchError ? <p role="status">비교 결과는 확인했지만 최근 검색을 저장하지 못했습니다.</p> : null}
          {recheckStatus === "success" ? <p role="status">출발 15분 전 재확인 알림을 신청했습니다.</p> : null}
          {recheckStatus === "error" ? <p role="alert">재확인 알림을 신청하지 못했습니다. 다시 시도해 주세요.</p> : null}
        </ConsumerContainer>
        <RecheckOptInDialog open={recheckOpen} busy={recheckStatus === "saving"} onClose={() => setRecheckOpen(false)} onConfirm={createRecheck} />
      </main>
    </ConsumerR2Theme>
  );
}
