import { toPlanRequest, toSaveRequest, validatePlannerInput } from './journeyContracts';

test('maps Journey placeId fields to the saved journey DTO without natural language text', () => {
  const request = toSaveRequest({ normalizedIntent: { origin: { placeId: 'kakao-origin', displayName: '성수역', latitude: 37.544, longitude: 127.056 }, destination: null, requiredBikeCount: 2, maxJourneyMinutes: 60, naturalLanguageText: '저장하면 안 되는 원문' } });
  expect(request).toEqual(expect.objectContaining({ origin: { providerId: 'kakao-origin', displayName: '성수역', latitude: 37.544, longitude: 127.056 }, destination: null }));
  expect(request).not.toHaveProperty('naturalLanguageText');
  expect(request.origin).toEqual({ providerId: 'kakao-origin', displayName: '성수역', latitude: 37.544, longitude: 127.056 });
});

test('requires selected origin and destination and preserves hidden compatibility defaults', () => {
  const origin = { placeId: 'origin', displayName: '출발', latitude: 37.5, longitude: 127.0 };
  const destination = { placeId: 'destination', displayName: '도착', latitude: 37.6, longitude: 127.1 };
  const input = { requestMode: 'FORM', origin, destination, departureAt: '2026-08-29T10:00', requiredBikeCount: 2, maxJourneyMinutes: 60, preferences: { scenery: 'MEDIUM' }, avoid: [] };
  expect(validatePlannerInput({ ...input, destination: null }, new Date('2026-08-28T10:00').getTime())).toContain('목적지');
  expect(validatePlannerInput({ ...input, requiredBikeCount: 6 }, new Date('2026-08-28T10:00').getTime())).toContain('1~5');
  expect(toPlanRequest(input)).toEqual(expect.objectContaining({ maxJourneyMinutes: 60, preferences: { scenery: 'MEDIUM' }, avoid: [] }));
});
