import { useState } from 'react';
import { planJourney, searchJourneyPlaces } from './api/journeyApi';
import { JOURNEY_INPUT_STORAGE_KEY, emptyPlannerInput, toPlanRequest, validatePlannerInput } from './contracts/journeyContracts';
import './JourneyPage.css';

function initialInput() {
  try { return { ...emptyPlannerInput, ...JSON.parse(sessionStorage.getItem(JOURNEY_INPUT_STORAGE_KEY) || 'null') }; } catch { return emptyPlannerInput; }
}

export default function JourneyPlannerPage({ authState, onNavigate }) {
  const [input, setInput] = useState(initialInput);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placeText, setPlaceText] = useState(() => ({ origin: input.origin?.displayName || '', destination: input.destination?.displayName || '' }));
  const [placeResults, setPlaceResults] = useState({ origin: [], destination: [] });
  const update = (key, value) => setInput((current) => ({ ...current, [key]: value }));
  const updateDepartureAt = (event) => update('departureAt', event.currentTarget.value);
  const submit = async (event) => {
    event.preventDefault();
    const submittedDepartureAt = event.currentTarget.elements.departureAt?.value || input.departureAt;
    const submissionInput = { ...input, departureAt: submittedDepartureAt };
    const validationMessage = validatePlannerInput(submissionInput);
    if (validationMessage) { setNotice(validationMessage); return; }
    if (authState !== 'authenticated') { sessionStorage.setItem(JOURNEY_INPUT_STORAGE_KEY, JSON.stringify(submissionInput)); setNotice('입력을 보존했습니다. 로그인 후 여정 만들기를 다시 눌러 주세요.'); return; }
    setSubmitting(true); setNotice('');
    try { const decision = await planJourney(toPlanRequest(submissionInput)); if (decision.decisionId) onNavigate('journey-result', decision.decisionId); }
    catch (error) { if (error.status === 401) sessionStorage.setItem(JOURNEY_INPUT_STORAGE_KEY, JSON.stringify(submissionInput)); setNotice(error.status === 401 ? '로그인이 필요합니다. 입력은 보존되었습니다.' : error.message); }
    finally { setSubmitting(false); }
  };
  const changePlaceText = async (kind, text) => {
    setPlaceText((current) => ({ ...current, [kind]: text }));
    update(kind, null);
    if (text.trim().length < 2) { setPlaceResults((current) => ({ ...current, [kind]: [] })); return; }
    try { const results = await searchJourneyPlaces(text); setPlaceResults((current) => ({ ...current, [kind]: results })); }
    catch { setPlaceResults((current) => ({ ...current, [kind]: [] })); }
  };
  const selectPlace = (kind, place) => { update(kind, place); setPlaceText((current) => ({ ...current, [kind]: place.displayName })); setPlaceResults((current) => ({ ...current, [kind]: [] })); };
  const placeInput = (kind, label) => <label>{label}<input aria-label={label} value={placeText[kind]} onChange={(event) => changePlaceText(kind, event.target.value)} />{placeResults[kind].length > 0 && <ul aria-label={`${label} 검색 결과`}>{placeResults[kind].map((place) => <li key={place.placeId}><button type="button" onClick={() => selectPlace(kind, place)}>{place.displayName}</button></li>)}</ul>}</label>;
  return <main className="journey-page"><section className="journey-hero"><p>Journey Planner</p><h1>여정 조건을 입력하세요</h1><span>출발지와 목적지는 검색 결과에서 선택해 주세요. AI는 입력 조건을 정리하고 기존 대여 예측을 활용합니다.</span></section><form className="journey-form" onSubmit={submit}>
    <label>입력 방식<select aria-label="입력 방식" value={input.requestMode} onChange={(e) => update('requestMode', e.target.value)}><option value="FORM">폼</option><option value="NATURAL_LANGUAGE">자연어</option></select></label>{input.requestMode === 'NATURAL_LANGUAGE' && <label>자연어 요청<textarea aria-label="자연어 요청" value={input.naturalLanguageText} onChange={(e) => update('naturalLanguageText', e.target.value)} /></label>}
    <div className="journey-grid">{placeInput('origin', '출발 장소')}{placeInput('destination', '목적지')}<label>출발 희망 시각<input aria-label="출발 희망 시각" name="departureAt" type="datetime-local" value={input.departureAt} onInput={updateDepartureAt} onChange={updateDepartureAt} /></label><label>필요한 자전거 수<input aria-label="필요한 자전거 수" type="number" min="1" max="5" value={input.requiredBikeCount} onChange={(e) => update('requiredBikeCount', e.target.value)} required /></label></div><p className="journey-help">대여소까지 이동 시간은 도보 기준입니다.</p>
    {notice && <p role="status" className="journey-notice">{notice}</p>}<button type="submit" disabled={submitting}>{submitting ? '여정 생성 중…' : '여정 만들기'}</button></form></main>;
}
