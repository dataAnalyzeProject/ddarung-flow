import { useEffect, useRef, useState } from 'react';
import { getJourney, replanJourney, saveJourney } from './api/journeyApi';
import { toSaveRequest } from './contracts/journeyContracts';
import { formatAvailabilityLevel, formatDistance, formatProbability, formatTime, formatWalkDuration } from './journeyPresentation';
import './JourneyPage.css';

const labels = { READY: '추천 결과', PARTIAL: '일부 추천 결과', CLARIFICATION_REQUIRED: '추가 확인 필요', UNAVAILABLE: '이용 불가', EXPIRED: '만료됨' };
const candidateValue = (candidate, field, formatter = (value) => value) => {
  const value = candidate?.[field];
  if (value === null || value === undefined || value === '') return null;
  const display = formatter(value);
  return display === null || display === undefined || display === '' ? null : display;
};

function candidateRows(candidate) {
  return [
    ['대여 가능성', candidateValue(candidate, 'rentalProbability', formatProbability)],
    ['상태', candidateValue(candidate, 'availabilityLevel', formatAvailabilityLevel)],
    ['현재 자전거', candidateValue(candidate, 'availableBikeCount', (value) => `${value}대`)],
    ['필요 자전거', candidateValue(candidate, 'requiredBikeCount', (value) => `${value}대`)],
    ['대여소까지 도보', candidateValue(candidate, 'accessDurationSeconds', formatWalkDuration)],
    ['거리', candidateValue(candidate, 'distanceMeters', formatDistance)],
    ['예상 도착', candidateValue(candidate, 'arrivalAt', formatTime)],
    ['재고 기준', candidateValue(candidate, 'inventoryCollectedAt', formatTime)],
  ].filter(([, value]) => value !== null);
}

function clarificationMessage(decision) {
  const missingFields = decision.clarification?.missingFields || [];
  if (missingFields.includes('destination') || !decision.normalizedIntent?.destination) return '목적지를 검색 결과에서 선택해 주세요.';
  return decision.clarification?.question || '추가 여정 조건을 확인해 주세요.';
}

export default function JourneyResultPage({ decisionId, onNavigate }) {
  const [state, setState] = useState({ type: 'loading' }); const [action, setAction] = useState(''); const requestToken = useRef(0);
  const load = async () => { const token = ++requestToken.current; setState({ type: 'loading' }); try { const decision = await getJourney(decisionId); if (token === requestToken.current) setState({ type: 'decision', decision }); } catch (error) { if (token === requestToken.current) setState({ type: error.status === 401 ? '401' : error.status === 404 ? '404' : error.status === 410 ? 'EXPIRED' : 'network', error }); } };
  useEffect(() => { load(); }, [decisionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const replan = async () => { if (state.type !== 'decision') return; const token = ++requestToken.current; setAction('replan'); try { const next = await replanJourney(decisionId, { ...(state.decision.normalizedIntent || {}), expectedRevision: state.decision.revision }); if (token === requestToken.current) setState({ type: 'decision', decision: next }); } catch (error) { if (token === requestToken.current) setAction(error.code === 'JOURNEY_REVISION_CONFLICT' ? 'revision-conflict' : error.message); return; } if (token === requestToken.current) setAction(''); };
  const save = async () => { if (state.type !== 'decision') return; try { const idempotencyKey = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; setAction('save'); await saveJourney(toSaveRequest(state.decision), idempotencyKey); setAction('saved'); } catch (error) { setAction(error.code === 'SAVED_ROUTE_LIMIT_REACHED' ? 'save-limit' : error.code === 'IDEMPOTENCY_CONFLICT' ? 'save-conflict' : error.message); } };
  if (state.type === 'loading') return <main className="journey-page"><p role="status">여정을 불러오는 중입니다.</p></main>;
  if (state.type !== 'decision') return <main className="journey-page"><section className="journey-unavailable" role="status"><h1>{state.type === '401' ? '로그인이 필요합니다' : state.type === '404' ? '여정을 찾을 수 없습니다' : state.type === 'EXPIRED' ? '여정이 만료되었습니다' : '네트워크 오류'}</h1><p>{state.type === 'network' ? '연결을 확인한 뒤 다시 시도해 주세요.' : '입력을 확인하고 새 여정을 만들어 주세요.'}</p></section><button onClick={() => onNavigate('journey')}>조건 다시 입력</button></main>;
  const { decision } = state; const status = decision.status || 'UNAVAILABLE'; const isUnavailable = status === 'UNAVAILABLE' || status === 'EXPIRED';
  return <main className="journey-page"><section className="journey-hero"><p>Journey Result</p><h1>{labels[status] || '여정 결과'}</h1>{status === 'CLARIFICATION_REQUIRED' && <p role="status">{clarificationMessage(decision)}</p>}<span>대여소까지 이동 시간은 도보 기준입니다.</span></section>{isUnavailable ? <section className="journey-unavailable" role="status"><h2>{status === 'EXPIRED' ? '여정이 만료되었습니다' : '추천을 만들 수 없습니다'}</h2><p>{status === 'EXPIRED' ? '조건을 다시 입력해 새 여정을 만들어 주세요.' : '현재 조건에서 대여 가능한 대여소를 찾지 못했습니다. 조건을 다시 입력해 주세요.'}</p></section> : <><section className="journey-candidates">{(decision.candidates || []).map((candidate, index) => <article key={candidate.candidateId}><p className="journey-rank">추천 {candidate.rank || index + 1}</p><h2>{candidate.stationName || candidate.candidateId}</h2><dl>{candidateRows(candidate).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>)}</section>{status === 'PARTIAL' && <p role="status" className="journey-notice">일부 대여소 정보가 아직 없어, 확인 가능한 후보만 보여드립니다.</p>}<section className="journey-provenance">{decision.provenance?.dataAsOf && <p>기준시각: {decision.provenance.dataAsOf}</p>}</section><div className="journey-actions"><button onClick={replan} disabled={action === 'replan'}>재계획</button><button onClick={save}>저장</button></div>{action === 'revision-conflict' && <p role="alert">다른 재계획 결과가 있습니다. 다시 불러와 주세요.</p>}{action === 'saved' && <p role="status">저장했습니다.</p>}{action === 'save-limit' && <p role="alert">저장 여정은 최대 10개입니다.</p>}{action === 'save-conflict' && <p role="alert">저장 요청이 충돌했습니다.</p>}</>}<button onClick={() => onNavigate('journey')}>조건 다시 입력</button></main>;
}
