import { useState } from 'react';
import { planJourney } from './api/journeyApi';
import { JOURNEY_INPUT_STORAGE_KEY, emptyPlannerInput, placeFromName, toPlanRequest } from './contracts/journeyContracts';
import './JourneyPage.css';

function initialInput() {
  try { return { ...emptyPlannerInput, ...JSON.parse(sessionStorage.getItem(JOURNEY_INPUT_STORAGE_KEY) || 'null') }; } catch { return emptyPlannerInput; }
}

export default function JourneyPlannerPage({ authState, onNavigate }) {
  const [input, setInput] = useState(initialInput);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const update = (key, value) => setInput((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (authState !== 'authenticated') { sessionStorage.setItem(JOURNEY_INPUT_STORAGE_KEY, JSON.stringify(input)); setNotice('입력을 보존했습니다. 로그인 후 여정 만들기를 다시 눌러 주세요.'); return; }
    setSubmitting(true); setNotice('');
    try { const decision = await planJourney(toPlanRequest(input)); if (decision.decisionId) onNavigate('journey-result', decision.decisionId); }
    catch (error) { if (error.status === 401) sessionStorage.setItem(JOURNEY_INPUT_STORAGE_KEY, JSON.stringify(input)); setNotice(error.status === 401 ? '로그인이 필요합니다. 입력은 보존되었습니다.' : error.message); }
    finally { setSubmitting(false); }
  };
  const originName = input.origin?.displayName || ''; const destinationName = input.destination?.displayName || '';
  return <main className="journey-page"><section className="journey-hero"><p>UI-24 · Journey Planner</p><h1>여정 조건을 입력하세요</h1><span>로그인 후 실제 여정 API로 후보를 만듭니다.</span></section><form className="journey-form" onSubmit={submit}>
    <label>입력 방식<select aria-label="입력 방식" value={input.requestMode} onChange={(e) => update('requestMode', e.target.value)}><option value="FORM">폼</option><option value="NATURAL_LANGUAGE">자연어</option></select></label><label>자연어 요청<textarea aria-label="자연어 요청" value={input.naturalLanguageText} onChange={(e) => update('naturalLanguageText', e.target.value)} disabled={input.requestMode !== 'NATURAL_LANGUAGE'} /></label>
    <div className="journey-grid"><label>출발 장소<input aria-label="출발 장소" value={originName} onChange={(e) => update('origin', placeFromName(e.target.value))} required /></label><label>최종 목적지 (선택)<input aria-label="최종 목적지" value={destinationName} onChange={(e) => update('destination', e.target.value.trim() ? placeFromName(e.target.value) : null)} /></label><label>필요한 자전거 수<input aria-label="필요한 자전거 수" type="number" min="1" max="5" value={input.requiredBikeCount} onChange={(e) => update('requiredBikeCount', e.target.value)} required /></label><label>최대 이동 시간(분)<input aria-label="최대 이동 시간" type="number" min="1" value={input.maxJourneyMinutes} onChange={(e) => update('maxJourneyMinutes', e.target.value)} required /></label><label>출발 희망 시각<input aria-label="출발 희망 시각" type="datetime-local" value={input.departureAt} onChange={(e) => update('departureAt', e.target.value)} /></label><label>회피 조건<select aria-label="회피 조건" value={input.avoid[0] || ''} onChange={(e) => update('avoid', e.target.value ? [e.target.value] : [])}><option value="">없음</option><option value="RAIN">비</option><option value="UNLIT_ROUTE">어두운 길</option></select></label></div>
    <fieldset><legend>선호</legend>{Object.entries(input.preferences).map(([key, value]) => <label key={key}>{key}<select aria-label={key} value={value} onChange={(e) => update('preferences', { ...input.preferences, [key]: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH'].map((option) => <option key={option}>{option}</option>)}</select></label>)}</fieldset>{notice && <p role="status" className="journey-notice">{notice}</p>}<button type="submit" disabled={submitting}>{submitting ? '여정 생성 중…' : '여정 만들기'}</button></form></main>;
}
