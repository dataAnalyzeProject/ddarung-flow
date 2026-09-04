import { candidateGuideContext, consumerHistoryState, guideContextForStation, isFreshMainResult, journeyHistoryInput, routeFromHash, searchHistoryInput } from './consumerNavigation';

const input = { origin: { providerId: 'origin', displayName: '출발지', latitude: 37.5, longitude: 127 }, destination: { providerId: 'anchor', displayName: '대여 기준점', latitude: 37.6, longitude: 127.1 }, travelMode: 'WALK', requiredBikeCount: 2 };
const now = Date.parse('2030-09-03T00:40:00Z');
const candidate = { stationId: 'ST-A', arrivalAt: '2030-09-03T01:00:00Z', expiresAt: null, horizonMinutes: 60 };

test('history retains only selected inputs and identifiers, never live result fields', () => {
  const state = consumerHistoryState({ entryId: 'visit-A', mainEntryId: 'main-A', restoreSearch: { ...input, candidates: [{ probability: 0.7 }], origin: { ...input.origin, availableBikeCount: 8 } }, currentResult: { candidates: [] }, journeyInput: { ...input, departureAt: '2026-09-03T18:00', maxJourneyMinutes: 90, rentalProbability: 0.9 }, guideContext: { stationId: 'ST-A', originLatitude: 37.5, originLongitude: 127, minutesAhead: 73, requiredBikeCount: 2, arrivalAt: 'server-time', availableBikeCount: 8 } });
  expect(state.restoreSearch).toEqual(input);
  expect(JSON.stringify(state)).not.toMatch(/candidates|currentResult|probability|rentalProbability|availableBikeCount|arrivalAt/);
  expect(state.guideContext.minutesAhead).toBeNull();
  expect(state.guideContext.originLatitude).toBeNull();
});

test('typed text stays input and does not become a selected provider location', () => {
  expect(searchHistoryInput({ ...input, origin: '서울역 검색 중' }).origin).toBe('서울역 검색 중');
  expect(journeyHistoryInput({ origin: '서울역 검색 중', maxJourneyMinutes: { probability: 1 } })).toEqual({ origin: null, destination: null, departureAt: '', maxJourneyMinutes: '', requiredBikeCount: '' });
});

test('Guide uses remaining arrival time, not model horizon from its feature timestamp', () => {
  expect(candidateGuideContext('ST-A', candidate, input, null, now)).toMatchObject({ originLatitude: 37.5, originLongitude: 127, minutesAhead: 20, requiredBikeCount: 2, journeyDecisionId: null });
  expect(candidateGuideContext('ST-A', { ...candidate, stationId: 'OTHER' }, input, null, now)).toEqual({});
});

test.each([null, 'invalid', '2030-09-03T00:30:00Z', '2030-09-03T00:40:59Z', '2030-09-03T04:41:00Z'])('unusable arrival %s omits the paired direct prediction inputs', (arrivalAt) => {
  expect(candidateGuideContext('ST-A', { ...candidate, arrivalAt }, input, null, now)).toEqual({ stationId: 'ST-A', journeyDecisionId: null, originLatitude: null, originLongitude: null, minutesAhead: null, requiredBikeCount: 2 });
});

test('Journey identity may provide backend context but cannot cross station identities', () => {
  const context = candidateGuideContext('ST-J', { stationId: 'ST-J', horizonMinutes: 120 }, input, 'decision-J', now);
  expect(context).toMatchObject({ journeyDecisionId: 'decision-J', originLatitude: 37.5, originLongitude: 127, minutesAhead: null });
  expect(guideContextForStation(context, 'ST-OTHER')).toEqual({});
});

test('future actual arrival permits cache restoration when the server does not supply expiresAt', () => {
  expect(isFreshMainResult({ candidates: [candidate] }, now)).toBe(true);
  expect(isFreshMainResult({ candidates: [{ ...candidate, expiresAt: undefined }] }, now)).toBe(true);
});

test.each([null, 'invalid', '2030-09-03T00:40:00Z'])('missing, invalid, or elapsed arrival %s invalidates restoration', (arrivalAt) => {
  expect(isFreshMainResult({ candidates: [{ ...candidate, arrivalAt }] }, now)).toBe(false);
});

test('still routes to checkout when a payment provider appends its own return params after the hash instead of into the real query string', () => {
  expect(routeFromHash('#premium/checkout').route).toBe('checkout');
  expect(routeFromHash('#premium/checkout&paymentKey=pk_1&orderId=order-1&amount=2900').route).toBe('checkout');
  expect(routeFromHash('#premium/checkout?paymentKey=pk_1&orderId=order-1&amount=2900').route).toBe('checkout');
});

test.each(['', 'invalid', '2030-09-03T00:35:00Z'])('a provided invalid or expired expiry %s invalidates restoration and Guide context', (expiresAt) => {
  const expired = { ...candidate, expiresAt };
  expect(isFreshMainResult({ candidates: [expired] }, now)).toBe(false);
  expect(candidateGuideContext('ST-A', expired, input, null, now).minutesAhead).toBeNull();
});
