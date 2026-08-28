import { toSaveRequest } from './journeyContracts';

test('maps Journey placeId fields to the saved journey DTO without natural language text', () => {
  const request = toSaveRequest({ normalizedIntent: { origin: { placeId: 'kakao-origin', displayName: '성수역', latitude: 37.544, longitude: 127.056 }, destination: null, requiredBikeCount: 2, maxJourneyMinutes: 60, naturalLanguageText: '저장하면 안 되는 원문' } });
  expect(request).toEqual(expect.objectContaining({ origin: { providerId: 'kakao-origin', displayName: '성수역', latitude: 37.544, longitude: 127.056 }, destination: null }));
  expect(request).not.toHaveProperty('naturalLanguageText');
  expect(request.origin).toEqual({ providerId: 'kakao-origin', displayName: '성수역', latitude: 37.544, longitude: 127.056 });
});
