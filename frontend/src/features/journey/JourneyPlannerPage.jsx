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
  const submit = async (event) => {
    event.preventDefault();
    const validationMessage = validatePlannerInput(input);
    if (validationMessage) { setNotice(validationMessage); return; }
    if (authState !== 'authenticated') { sessionStorage.setItem(JOURNEY_INPUT_STORAGE_KEY, JSON.stringify(input)); setNotice('입력을 보존했습니다. 로그인 후 여정 만들기를 다시 눌러 주세요.'); return; }
    setSubmitting(true); setNotice('');
    try { const decision = await planJourney(toPlanRequest(input)); if (decision.decisionId) onNavigate('journey-result', decision.decisionId); }
    catch (error) { if (error.status === 401) sessionStorage.setItem(JOURNEY_INPUT_STORAGE_KEY, JSON.stringify(input)); setNotice(error.status === 401 ? '로그인이 필요합니다. 입력은 보존되었습니다.' : error.message); }
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
  return <main className="journey-page"><section className="journey-hero"><p>UI-24 · Journey Planner</p><h1>여정 조건을 입력하세요</h1><span>로그인 후 실제 여정 API로 후보를 만듭니다.</span></section><form className="journey-form" onSubmit={submit}>
    <label>입력 방식<select aria-label="입력 방식" value={input.requestMode} onChange={(e) => update('requestMode', e.target.value)}><option value="FORM">폼</option><option value="NATURAL_LANGUAGE">자연어</option></select></label><label>자연어 요청<textarea aria-label="자연어 요청" value={input.naturalLanguageText} onChange={(e) => update('naturalLanguageText', e.target.value)} disabled={input.requestMode !== 'NATURAL_LANGUAGE'} /></label>
    <div className="journey-grid">{placeInput('origin', '출발 장소')}{placeInput('destination', '최종 목적지 (선택)')}<label>필요한 자전거 수<input aria-label="필요한 자전거 수" type="number" min="1" max="5" value={input.requiredBikeCount} onChange={(e) => update('requiredBikeCount', e.target.value)} required /></label><label>최대 이동 시간(분)<input aria-label="최대 이동 시간" type="number" min="1" value={input.maxJourneyMinutes} onChange={(e) => update('maxJourneyMinutes', e.target.value)} required /></label><label>출발 희망 시각<input aria-label="출발 희망 시각" type="datetime-local" value={input.departureAt} onChange={(e) => update('departureAt', e.target.value)} /></label><label>회피 조건<select aria-label="회피 조건" value={input.avoid[0] || ''} onChange={(e) => update('avoid', e.target.value ? [e.target.value] : [])}><option value="">없음</option><option value="RAIN">비</option><option value="UNLIT_ROUTE">어두운 길</option></select></label></div>
    <fieldset><legend>선호</legend>{Object.entries(input.preferences).map(([key, value]) => <label key={key}>{key}<select aria-label={key} value={value} onChange={(e) => update('preferences', { ...input.preferences, [key]: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH'].map((option) => <option key={option}>{option}</option>)}</select></label>)}</fieldset>{notice && <p role="status" className="journey-notice">{notice}</p>}<button type="submit" disabled={submitting}>{submitting ? '여정 생성 중…' : '여정 만들기'}</button></form></main>;
}
