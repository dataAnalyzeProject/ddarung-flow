const HORIZONS = [60, 120, 180, 240];
const BIKE_COUNTS = [1, 2, 3, 4, 5];
const DATA_STATES = ['NORMAL', 'DELAYED', 'MISSING', 'INSUFFICIENT_DATA', 'UNAVAILABLE'];
export const DEFAULT_RISK_MAP_QUERY = { horizonMinutes: 60, requiredBikeCount: 1, dataState: null };
function allowed(value, choices, fallback) { const number = Number(value); return choices.includes(number) ? number : fallback; }
export function parseRiskMapQuery(search = window.location.search) { const params = new URLSearchParams(search); const requestedState = params.get('dataState'); return { horizonMinutes: allowed(params.get('horizonMinutes'), HORIZONS, DEFAULT_RISK_MAP_QUERY.horizonMinutes), requiredBikeCount: allowed(params.get('requiredBikeCount'), BIKE_COUNTS, DEFAULT_RISK_MAP_QUERY.requiredBikeCount), dataState: DATA_STATES.includes(requestedState) ? requestedState : null }; }
export function updateRiskMapQuery(next, search = window.location.search) { const params = new URLSearchParams(search); params.set('horizonMinutes', String(next.horizonMinutes)); params.set('requiredBikeCount', String(next.requiredBikeCount)); if (next.dataState) params.set('dataState', next.dataState); else params.delete('dataState'); const value = params.toString(); return value ? `?${value}` : ''; }
export function riskMapFixtureName(search = window.location.search) { return process.env.NODE_ENV === 'production' ? null : new URLSearchParams(search).get('riskMapFixture'); }
