const RETURN_KEY = 'ddarung.consumer-r2.return.v1';
const SIMPLE_ROUTES = ['archive', 'mypage', 'qna', 'alerts', 'journey'];

function placeInput(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const providerId = value.providerId || value.placeId;
  const displayName = value.displayName || value.name || '';
  if (typeof providerId !== 'string' || !providerId || !displayName
    || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90
    || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180) return displayName;
  return { providerId, displayName, latitude: value.latitude, longitude: value.longitude };
}

export function searchHistoryInput(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    origin: placeInput(value.origin), destination: placeInput(value.destination),
    travelMode: ['WALK', 'PUBLIC_TRANSIT'].includes(value.travelMode) ? value.travelMode : null,
    requiredBikeCount: Number.isInteger(value.requiredBikeCount) && value.requiredBikeCount >= 1 && value.requiredBikeCount <= 5 ? value.requiredBikeCount : null,
  };
}

export function journeyHistoryInput(value) {
  if (!value || typeof value !== 'object') return null;
  const place = placeInput(value.origin);
  const destination = placeInput(value.destination);
  return {
    origin: place && typeof place === 'object' ? place : null,
    destination: destination && typeof destination === 'object' ? destination : null,
    departureAt: typeof value.departureAt === 'string' ? value.departureAt : '',
    maxJourneyMinutes: Number.isInteger(Number(value.maxJourneyMinutes)) && Number(value.maxJourneyMinutes) >= 1 && Number(value.maxJourneyMinutes) <= 480 ? Number(value.maxJourneyMinutes) : '',
    requiredBikeCount: Number.isInteger(Number(value.requiredBikeCount)) && Number(value.requiredBikeCount) >= 1 && Number(value.requiredBikeCount) <= 5 ? Number(value.requiredBikeCount) : '',
  };
}

export function guideContextForStation(value, stationId) {
  if (!value || value.stationId !== stationId) return {};
  const journeyDecisionId = typeof value.journeyDecisionId === 'string' && value.journeyDecisionId ? value.journeyDecisionId : null;
  const hasOrigin = Number.isFinite(value.originLatitude) && Math.abs(value.originLatitude) <= 90
    && Number.isFinite(value.originLongitude) && Math.abs(value.originLongitude) <= 180;
  const hasHorizon = Number.isInteger(value.minutesAhead) && value.minutesAhead >= 1 && value.minutesAhead <= 240;
  return {
    stationId, journeyDecisionId,
    originLatitude: hasOrigin && (hasHorizon || journeyDecisionId) ? value.originLatitude : null,
    originLongitude: hasOrigin && (hasHorizon || journeyDecisionId) ? value.originLongitude : null,
    minutesAhead: hasHorizon && (hasOrigin || journeyDecisionId) ? value.minutesAhead : null,
    requiredBikeCount: Number.isInteger(value.requiredBikeCount) && value.requiredBikeCount >= 1 && value.requiredBikeCount <= 5 ? value.requiredBikeCount : null,
  };
}

export function isFutureTimestamp(value, now = Date.now()) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) > now;
}

export function isFreshCandidate(candidate, now = Date.now()) {
  return isFutureTimestamp(candidate?.arrivalAt, now)
    && (candidate.expiresAt === null || candidate.expiresAt === undefined || isFutureTimestamp(candidate.expiresAt, now));
}

export function isFreshMainResult(result, now = Date.now()) {
  return Array.isArray(result?.candidates) && result.candidates.length > 0
    && result.candidates.every((candidate) => isFreshCandidate(candidate, now));
}

export function candidateGuideContext(stationId, candidate, input, decisionId = null, now = Date.now()) {
  if (!candidate || candidate.stationId !== stationId) return {};
  const remainingMinutes = !decisionId && isFreshCandidate(candidate, now)
    ? (Date.parse(candidate.arrivalAt) - now) / 60000 : null;
  const minutesAhead = remainingMinutes > 0 && remainingMinutes <= 240 ? Math.floor(remainingMinutes) : null;
  return guideContextForStation({
    stationId, journeyDecisionId: decisionId,
    originLatitude: input?.origin?.latitude, originLongitude: input?.origin?.longitude,
    minutesAhead, requiredBikeCount: input?.requiredBikeCount ?? candidate.requiredBikeCount,
  }, stationId);
}

export function consumerHistoryState(value = {}) {
  const state = {};
  for (const key of ['entryId', 'mainEntryId', 'selectedStationId', 'journeyDecisionId', 'questionId']) {
    if (typeof value?.[key] === 'string' && value[key]) state[key] = value[key];
  }
  if (value?.restoreSearch) state.restoreSearch = searchHistoryInput(value.restoreSearch);
  if (value?.journeyInput) state.journeyInput = journeyHistoryInput(value.journeyInput);
  if (typeof value?.guideContext?.stationId === 'string') {
    state.guideContext = guideContextForStation({ ...value.guideContext, minutesAhead: null }, value.guideContext.stationId);
  }
  return state;
}

export function newConsumerEntryId() {
  return window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}

export function navigationTarget(name, id) {
  const route = ({ home: 'main', planner: 'journey', premium: 'checkout', 'premium-checkout': 'checkout' })[name] || name;
  if (['station', 'ride', 'guide', 'journey-result'].includes(route) && typeof id === 'string' && id) {
    const prefix = route === 'journey-result' ? 'journey/result' : route;
    return { hash: '#' + prefix + '/' + encodeURIComponent(id), route, stationId: id };
  }
  if (route === 'checkout') return { hash: '#premium/checkout', route, stationId: null };
  if (SIMPLE_ROUTES.includes(route)) return { hash: '#' + route, route, stationId: null };
  return { hash: '', route: 'main', stationId: null };
}

export function routeFromHash(hash = window.location.hash) {
  const value = hash.replace(/^#/, '');
  if (value === 'premium/checkout') return navigationTarget('checkout');
  for (const prefix of ['journey/result', 'station', 'ride', 'guide']) {
    if (!value.startsWith(prefix + '/')) continue;
    try {
      const id = decodeURIComponent(value.slice(prefix.length + 1));
      return navigationTarget(prefix === 'journey/result' ? 'journey-result' : prefix, id);
    } catch { return navigationTarget('main'); }
  }
  return navigationTarget(value);
}

export function normalizeConsumerReturn(value) {
  if (typeof value !== 'string' || !(value.startsWith('#') || value.startsWith('/'))) return null;
  try {
    const target = new URL(value.startsWith('#') ? '/' + value : value, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname !== '/') return null;
    const resolved = routeFromHash(target.hash);
    if (target.hash && resolved.hash !== target.hash) return null;
    return '/' + resolved.hash;
  } catch { return null; }
}

export function storeConsumerReturn(value) {
  const target = normalizeConsumerReturn(value);
  if (target) window.sessionStorage.setItem(RETURN_KEY, target);
  return target;
}

export function consumeConsumerReturn() {
  const target = normalizeConsumerReturn(window.sessionStorage.getItem(RETURN_KEY));
  window.sessionStorage.removeItem(RETURN_KEY);
  return target;
}
