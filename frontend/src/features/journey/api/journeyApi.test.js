import { getJourney, planJourney, saveJourney, searchJourneyPlaces } from './journeyApi';

beforeEach(() => { global.fetch = jest.fn(); });
const json = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

test('uses cookies and CSRF for planning', async () => {
  fetch.mockReturnValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })).mockReturnValueOnce(json({ decisionId: 'd1' }));
  await planJourney({ origin: { placeId: 'o' }, destination: null });
  expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/auth/csrf', expect.objectContaining({ credentials: 'include' }));
  expect(fetch).toHaveBeenLastCalledWith('http://localhost:8080/api/v1/journeys/plan', expect.objectContaining({ headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'csrf' }) }));
});

test('sends the save idempotency key after CSRF', async () => {
  fetch.mockReturnValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })).mockReturnValueOnce(json({ savedJourneyId: 's1' }));
  await saveJourney({ origin: { placeId: 'o' }, destination: null }, 'key-1');
  expect(fetch).toHaveBeenLastCalledWith('http://localhost:8080/api/v1/saved-journeys', expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'key-1', 'X-CSRF-TOKEN': 'csrf' }) }));
});

test('preserves HTTP status and API code on errors', async () => {
  fetch.mockReturnValueOnce(json({ code: 'JOURNEY_NOT_ACCESSIBLE' }, 404));
  await expect(getJourney('missing')).rejects.toMatchObject({ status: 404, code: 'JOURNEY_NOT_ACCESSIBLE' });
});

test('normalizes actual place search results for selected Journey places', async () => {
  fetch.mockReturnValueOnce(json({ places: [{ placeId: 'kakao-1', name: '성수역', latitude: 37.544, longitude: 127.056 }] }));
  await expect(searchJourneyPlaces('성수')).resolves.toEqual([{ placeId: 'kakao-1', displayName: '성수역', latitude: 37.544, longitude: 127.056 }]);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/places/search?query=%EC%84%B1%EC%88%98'), expect.objectContaining({ credentials: 'include' }));
});
