const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || '여정 요청에 실패했습니다.'), { status: response.status, code: body.code, body });
  return response.status === 204 ? null : body;
}

async function mutation(path, body, extraHeaders = {}) {
  const csrf = await request('/api/v1/auth/csrf');
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token, ...extraHeaders }, body: JSON.stringify(body) });
}

export const planJourney = (input) => mutation('/api/v1/journeys/plan', input);
export async function searchJourneyPlaces(query) {
  const params = new URLSearchParams({ query: query.trim(), page: '1', size: '10' });
  const body = await request(`/api/v1/places/search?${params}`);
  return (body.places || []).map((place) => ({ placeId: place.placeId, displayName: place.displayName || place.name, latitude: Number(place.latitude), longitude: Number(place.longitude) }));
}
export const getJourney = (decisionId) => request(`/api/v1/journeys/${encodeURIComponent(decisionId)}`);
export const replanJourney = (decisionId, input) => mutation(`/api/v1/journeys/${encodeURIComponent(decisionId)}/replan`, input);
export const getCounterfactuals = (decisionId) => mutation(`/api/v1/journeys/${encodeURIComponent(decisionId)}/counterfactuals`, {});
export const saveJourney = (input, idempotencyKey) => mutation('/api/v1/saved-journeys', input, { 'Idempotency-Key': idempotencyKey });
export const listSavedJourneys = () => request('/api/v1/saved-journeys');
export async function deleteSavedJourney(id) { const csrf = await request('/api/v1/auth/csrf'); return request(`/api/v1/saved-journeys/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { [csrf.headerName]: csrf.token } }); }
