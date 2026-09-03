import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { navigationTarget } from './App';
import { getCurrentUser, logout } from './features/login/authApi';
import { fetchSubscription } from './features/premium/subscriptionApi';
import { INTRO_SEEN_KEY } from './features/intro/introStorage';
import { normalizeConsumerReturn, routeFromHash, consumeConsumerReturn, storeConsumerReturn } from './features/consumer-r2/adapters/navigation/consumerNavigation';

jest.mock('./features/login/authApi', () => ({
  getCurrentUser: jest.fn(), logout: jest.fn(), startSocialLogin: jest.fn(),
}));
jest.mock('./features/premium/subscriptionApi', () => ({ fetchSubscription: jest.fn() }));
jest.mock('./features/admin-v2/shell/AdminV2PreviewApp', () => () => <h1>Admin preview</h1>);
jest.mock('./features/admin-v2/shell/AdminV2ProductionApp', () => () => <h1>Admin production</h1>);
jest.mock('./features/consumer-r2/entry', () => ({
  LoginPage: () => <h1>Login</h1>,
  OpeningPage: ({ onComplete }) => <button onClick={onComplete}>Opening complete</button>,
}));
jest.mock('./features/consumer-r2/main/ConsumerMainPage', () => function MockMain({ onNavigate, onOpenStation, onOpenRide, onInputChange, onSearchComplete, restoreSearch, currentResult, rideGuidance }) {
  const [liveCandidate, setLiveCandidate] = require('react').useState(null);
  require('react').useEffect(() => { mockMainRestoreChange(); }, [restoreSearch, currentResult]);
  return <section>
  <h1>Main</h1><output>{restoreSearch?.origin?.displayName || (typeof restoreSearch?.origin === 'string' ? restoreSearch.origin : '')}</output>
  <output data-testid="main-input">{JSON.stringify(restoreSearch || null)}</output><output data-testid="main-result">{JSON.stringify(currentResult || null)}</output>
  {rideGuidance ? <p role="status">라이딩을 보려면 먼저 대여소를 선택해 주세요.</p> : null}
  <button onClick={() => onOpenStation(liveCandidate || currentResult?.candidates?.[0] || { stationId: 'ST-1' }, restoreSearch)}>Station</button>
  <button onClick={() => onOpenRide(liveCandidate || currentResult?.candidates?.[0] || { stationId: 'ST-1' }, restoreSearch)}>Ride</button>
  <button onClick={() => { onInputChange(mockInputA); onSearchComplete(mockInputA, mockResultA); setLiveCandidate(mockResultA.candidates[0]); }}>Search A</button>
  <button onClick={() => onInputChange(mockInputA)}>Enter A</button>
  <button onClick={() => { const input = { ...mockInputA, origin: '수정 중' }; onInputChange(input); onSearchComplete(input, null); }}>Edit input</button>
  <button onClick={() => onNavigate('alerts')}>Alerts</button>
  <button onClick={() => onNavigate('planner')}>Planner</button>
  <button onClick={() => onNavigate('archive')}>Archive</button>
  <button onClick={() => onNavigate('mypage')}>Account</button>
  <button onClick={() => onNavigate('ride')}>Header ride</button>
</section>;
});
jest.mock('./features/consumer-r2/station/StationDetailPage', () => ({ stationId, onNavigate }) => <section><h1>Station {stationId}</h1><button onClick={() => onNavigate('ride', stationId)}>Ride</button><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={() => onNavigate('home')}>Home</button></section>);
jest.mock('./features/consumer-r2/ride/RideExplorePage', () => ({ stationId, onNavigate }) => <section><h1>Ride {stationId}</h1><button onClick={() => onNavigate('guide', stationId)}>Guide</button><button onClick={() => onNavigate('home')}>Home</button></section>);
jest.mock('./features/consumer-r2/guide/ConsumerRidingGuidePage', () => ({ stationId, guideContext, onNavigate }) => <section><h1>Guide {stationId}</h1><output data-testid="guide-context">{JSON.stringify(guideContext)}</output><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={() => onNavigate('home')}>Home</button></section>);
jest.mock('./features/consumer-r2/journey', () => {
  const { useEffect } = require('react');
  return {
    ConsumerJourneyPlannerPage: ({ onNavigate, onResult, initialInput }) => <section><h1>Planner active</h1><output data-testid="planner-input">{JSON.stringify(initialInput)}</output><button onClick={() => { onResult(mockDecision); onNavigate('journey-result', mockDecision.decisionId); }}>Result</button></section>,
    ConsumerJourneyPlanResultPage: ({ decisionId, initialDecision, onResult, onNavigate }) => {
      useEffect(() => { if (!initialDecision) mockLoadDecision(decisionId); if (decisionId === mockDecision.decisionId) onResult(initialDecision || mockDecision); }, [decisionId, initialDecision, onResult]);
      return <section><h1>Result {decisionId}</h1><output data-testid="result-initial">{JSON.stringify(initialDecision || null)}</output><button onClick={() => onNavigate('ride')}>Selected ride</button></section>;
    },
  };
});
jest.mock('./features/consumer-r2/personal', () => ({
  PersonalArchivePage: ({ authState, onNavigate, onReplay }) => <section><h1>Archive {authState}</h1>
    <button onClick={() => onNavigate('main', { restoreSearch: { origin: { displayName: '서울역' } } })}>Restore search</button>
    <button onClick={() => onReplay({ decisionId: 'replay-1' })}>Replay</button>
  </section>,
  PersonalMyPage: ({ adapter, onNavigate }) => <section><h1>Account</h1><button onClick={async () => { await adapter.logout(); onNavigate('archive'); }}>Logout</button></section>,
}));
jest.mock('./features/consumer-r2/support', () => ({
  ConsumerQnaPage: ({ initialQuestionId }) => <h1>Qna {initialQuestionId}</h1>,
  ConsumerAlertsPage: ({ onNavigate, onCurrentData, searchInput }) => <section><h1>Alerts</h1><output data-testid="alerts-input">{JSON.stringify(searchInput || null)}</output><button onClick={() => onNavigate('qna', { questionId: 'q1' })}>Answer</button><button onClick={() => onCurrentData({ kind: 'SEARCH_RECHECK', result: mockResultA }, mockInputA)}>Recheck A</button><button onClick={() => onCurrentData({ kind: 'SEARCH_RECHECK', result: mockResultB }, mockInputB)}>Recheck B</button><button onClick={() => onNavigate('home')}>Home</button></section>,
}));

const mockInputA = { origin: { providerId: 'origin-A', displayName: '출발 A', latitude: 37.55, longitude: 126.97 }, destination: { providerId: 'anchor-A', displayName: '대여 기준 A', latitude: 37.57, longitude: 126.98 }, travelMode: 'WALK', requiredBikeCount: 3 };
const mockInputB = { ...mockInputA, origin: { providerId: 'origin-B', displayName: '출발 B', latitude: 37.61, longitude: 127.02 }, requiredBikeCount: 2 };
const mockNow = Date.parse('2030-09-03T00:40:00Z');
let mockResultA;
let mockResultB;
const mockLoadDecision = jest.fn();
const mockMainRestoreChange = jest.fn();
const mockDecision = { decisionId: 'decision-1', revision: 1, expiresAt: '2030-09-03T01:05:00Z', normalizedIntent: { origin: { placeId: 'journey-origin', displayName: '일정 출발지', latitude: 37.62, longitude: 127.03 }, requiredBikeCount: 4 }, candidates: [{ candidateId: 'candidate-id-is-not-station', stationId: 'ST-J', arrivalAt: '2030-09-03T01:00:00Z', horizonMinutes: 120, requiredBikeCount: 4, rentalProbability: 0.91 }], unifiedPlan: { selectedRentalCandidateId: 'rental:ST-J', segments: [] } };

function output(name) { return JSON.parse(screen.getByTestId(name).textContent); }
jest.mock('./features/consumer-r2/premium', () => ({
  PremiumAccessGatePage: ({ accessState, onOpenCheckout }) => <section><h1>Gate {accessState}</h1><button onClick={onOpenCheckout}>Checkout</button></section>,
  PremiumSandboxCheckoutPage: ({ accessState }) => <h1>Checkout {accessState}</h1>,
}));

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(mockNow);
  mockResultA = { candidates: [{ stationId: 'ST-A', horizonMinutes: 60, predictionProbability: 0.81, arrivalAt: '2030-09-03T01:00:00Z', expiresAt: null }] };
  mockResultB = { candidates: [{ stationId: 'ST-B', horizonMinutes: 120, predictionProbability: 0.52, arrivalAt: '2030-09-03T01:10:00Z', expiresAt: '2030-09-03T01:05:00Z' }] };
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  getCurrentUser.mockResolvedValue({ authenticated: true, user: { id: 'test-user', displayName: '사용자' } });
  fetchSubscription.mockResolvedValue({ status: 'ACTIVE' });
  logout.mockResolvedValue();
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

function visit(path) {
  window.localStorage.setItem(INTRO_SEEN_KEY, 'true');
  window.history.replaceState({}, '', path);
  return render(<App />);
}

test('first visit Opening completes into the new Main', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Opening complete'));
  expect(await screen.findByRole('heading', { name: 'Main' })).toBeInTheDocument();
});

test.each([
  ['/login', 'Login'], ['/', 'Main'], ['/#station/ST-1', 'Station ST-1'],
  ['/#ride/ST-1', 'Ride ST-1'], ['/#guide/ST-1', 'Guide ST-1'],
  ['/#journey', 'Planner active'], ['/#journey/result/decision-1', 'Result decision-1'],
  ['/#premium/checkout', 'Checkout ACTIVE'], ['/#archive', 'Archive authenticated'],
  ['/#mypage', 'Account'], ['/#qna', 'Qna'], ['/#alerts', 'Alerts'],
])('direct route and refreshed mount %s renders R2 presentation', async (path, heading) => {
  const view = visit(path);
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  view.unmount();
  render(<App />);
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
});

test.each(['ANONYMOUS', 'FREE', 'EXPIRED', 'ERROR'])('AI entry is gated for %s', async (state) => {
  if (state === 'ANONYMOUS') getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  else if (state === 'ERROR') fetchSubscription.mockRejectedValue(new Error('unavailable'));
  else fetchSubscription.mockResolvedValue({ status: state });
  visit('/#journey');
  expect(await screen.findByRole('heading', { name: 'Gate ' + state })).toBeInTheDocument();
  expect(screen.queryByText('Planner active')).not.toBeInTheDocument();
});

test('candidate callbacks and browser back restore the route', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Station'));
  expect(await screen.findByRole('heading', { name: 'Station ST-1' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#station/ST-1');
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  fireEvent.click(screen.getByText('Ride'));
  expect(await screen.findByRole('heading', { name: 'Ride ST-1' })).toBeInTheDocument();
});

test('archive restores input and alerts deep-link to the actual question', async () => {
  const view = visit('/#archive');
  fireEvent.click(await screen.findByText('Restore search'));
  expect(await screen.findByText('서울역')).toBeInTheDocument();
  view.unmount();
  visit('/#alerts');
  fireEvent.click(await screen.findByText('Answer'));
  expect(await screen.findByRole('heading', { name: 'Qna q1' })).toBeInTheDocument();
});

test('logout updates App auth before another personal route opens', async () => {
  visit('/#mypage');
  fireEvent.click(await screen.findByText('Logout'));
  expect(await screen.findByRole('heading', { name: 'Archive anonymous' })).toBeInTheDocument();
  expect(logout).toHaveBeenCalledTimes(1);
});

test('admin routing is preserved and skips the consumer session request', async () => {
  window.history.replaceState({ adminTab: 'permissions' }, '', '/admin');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Admin production' })).toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
  expect(window.history.state).toEqual({ adminTab: 'permissions' });
});

test('encoded identifiers round-trip and consumer returns cannot leave the app', () => {
  const target = navigationTarget('station', 'ST-서울 1');
  expect(routeFromHash(target.hash)).toEqual(target);
  expect(routeFromHash('#station/%broken')).toEqual(navigationTarget('main'));
  expect(navigationTarget('planner').hash).toBe('#journey');
  expect(normalizeConsumerReturn('//evil.example')).toBeNull();
  expect(normalizeConsumerReturn('/admin')).toBeNull();
  expect(normalizeConsumerReturn('/login')).toBeNull();
  storeConsumerReturn('/#guide/ST-1');
  expect(consumeConsumerReturn()).toBe('/#guide/ST-1');
  expect(consumeConsumerReturn()).toBeNull();
});

test('Main results and complete selected input survive Station and browser back', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-A' });
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toEqual(mockResultA);
});

test('Ride and Home retain the related Main input/result, while refresh retains input only', async () => {
  const view = visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  fireEvent.click(screen.getByText('Home'));
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toEqual(mockResultA);
  expect(JSON.stringify(window.history.state)).not.toMatch(/predictionProbability|arrivalAt|candidates/);
  view.unmount();
  render(<App />);
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toBeNull();
});

test('two search rechecks retain their own input/result pair across two browser back actions', async () => {
  visit('/#alerts');
  fireEvent.click(await screen.findByText('Recheck A'));
  expect(output('main-input')).toEqual(mockInputA);
  fireEvent.click(screen.getByText('Alerts'));
  await screen.findByRole('heading', { name: 'Alerts' });
  expect(output('alerts-input')).toEqual(mockInputA);
  fireEvent.click(screen.getByText('Recheck B'));
  expect(output('main-input')).toEqual(mockInputB);
  expect(output('main-result')).toEqual(mockResultB);
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Alerts' });
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toEqual(mockResultA);
});

test('explicit archive restoration never receives the preceding Main result', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Archive'));
  fireEvent.click(await screen.findByText('Restore search'));
  expect(output('main-result')).toBeNull();
  expect(output('main-input').origin).toBe('서울역');
});

test('editing a search invalidates its memory result and preserves partial input', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Edit input'));
  expect(output('main-result')).toBeNull();
  expect(output('main-input').origin).toBe('수정 중');
  fireEvent.click(screen.getByText('Alerts'));
  fireEvent.click(await screen.findByText('Home'));
  expect(output('main-result')).toBeNull();
  expect(output('main-input').origin).toBe('수정 중');
});

test('Guide uses remaining arrival time and clears relative time after refreshed mount', async () => {
  const view = visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-A' });
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  fireEvent.click(screen.getByText('Guide'));
  await screen.findByRole('heading', { name: 'Guide ST-A' });
  const context = { stationId: 'ST-A', journeyDecisionId: null, originLatitude: 37.55, originLongitude: 126.97, minutesAhead: 20, requiredBikeCount: 3 };
  expect(output('guide-context')).toEqual(context);
  expect(JSON.stringify(window.history.state)).not.toMatch(/predictionProbability|arrivalAt|candidates/);
  expect(window.history.state.guideContext.minutesAhead).toBeNull();
  view.unmount();
  render(<App />);
  await screen.findByRole('heading', { name: 'Guide ST-A' });
  expect(output('guide-context')).toEqual({});
});

test('a different Guide station cannot inherit the prior station request context', async () => {
  window.localStorage.setItem(INTRO_SEEN_KEY, 'true');
  window.history.replaceState({ guideContext: { stationId: 'ST-A', originLatitude: 37.55, originLongitude: 126.97, minutesAhead: 73, requiredBikeCount: 3, journeyDecisionId: 'decision-old' } }, '', '/#guide/ST-OTHER');
  render(<App />);
  await screen.findByRole('heading', { name: 'Guide ST-OTHER' });
  expect(output('guide-context')).toEqual({});
});

test('Main planner prefills origin and count without converting its rental anchor to a bicycle destination', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Planner'));
  await screen.findByRole('heading', { name: 'Planner active' });
  expect(output('planner-input')).toEqual({ origin: mockInputA.origin, destination: null, departureAt: '', maxJourneyMinutes: '', requiredBikeCount: 3 });
});

test('a loaded Journey decision connects only its selected rental station to Guide', async () => {
  visit('/#journey/result/decision-1');
  await screen.findByRole('heading', { name: 'Result decision-1' });
  fireEvent.click(screen.getByText('Selected ride'));
  await screen.findByRole('heading', { name: 'Ride ST-J' });
  fireEvent.click(screen.getByText('Guide'));
  await screen.findByRole('heading', { name: 'Guide ST-J' });
  expect(output('guide-context')).toEqual({ stationId: 'ST-J', journeyDecisionId: 'decision-1', originLatitude: 37.62, originLongitude: 127.03, minutesAhead: null, requiredBikeCount: 4 });
  expect(JSON.stringify(window.history.state)).not.toMatch(/rentalProbability|unifiedPlan|candidates|revision/);
});

test('Guide recomputes time after time spent on Ride rather than replaying the model horizon', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  Date.now.mockReturnValue(Date.parse('2030-09-03T00:50:00Z'));
  fireEvent.click(screen.getByText('Guide'));
  await screen.findByRole('heading', { name: 'Guide ST-A' });
  expect(output('guide-context').minutesAhead).toBe(10);
});

test('a new live response without cache freshness does not restart the current Main restoration effect', async () => {
  mockResultA.candidates[0].arrivalAt = null;
  visit('/');
  fireEvent.click(await screen.findByText('Enter A'));
  const restoresBeforeResponse = mockMainRestoreChange.mock.calls.length;
  fireEvent.click(screen.getByText('Search A'));
  expect(mockMainRestoreChange).toHaveBeenCalledTimes(restoresBeforeResponse);
  expect(output('main-result')).toBeNull();
});

test.each([
  ['arrival passed', '2030-09-03T01:01:00Z', null],
  ['provided expiry passed', '2030-09-03T00:50:00Z', '2030-09-03T00:45:00Z'],
])('Main restores input only after %s', async (_label, now, expiresAt) => {
  mockResultA.candidates[0].expiresAt = expiresAt;
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  Date.now.mockReturnValue(Date.parse(now));
  fireEvent.click(screen.getByText('Home'));
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toBeNull();
});

test.each([null, 'invalid', '2030-09-03T00:30:00Z'])('missing, invalid, or past arrival %s cannot restore facts', async (arrivalAt) => {
  mockResultA.candidates[0].arrivalAt = arrivalAt;
  visit('/#alerts');
  fireEvent.click(await screen.findByText('Recheck A'));
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toBeNull();
});

test('Guide cannot combine a cached candidate with a different current origin', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  window.history.replaceState({ ...window.history.state, restoreSearch: mockInputB }, '', '/#ride/ST-A');
  fireEvent.click(screen.getByText('Guide'));
  await screen.findByRole('heading', { name: 'Guide ST-A' });
  expect(output('guide-context')).toEqual({});
});

test('Journey result always requests the server even after a completed planner supplied a cached decision', async () => {
  visit('/#journey');
  fireEvent.click(await screen.findByText('Result'));
  await screen.findByRole('heading', { name: 'Result decision-1' });
  expect(output('result-initial')).toBeNull();
  expect(mockLoadDecision).toHaveBeenCalledWith('decision-1');
  const initialLoads = mockLoadDecision.mock.calls.length;
  Date.now.mockReturnValue(Date.parse('2030-09-03T02:00:00Z'));
  fireEvent.click(screen.getByText('Selected ride'));
  await screen.findByRole('heading', { name: 'Ride ST-J' });
  fireEvent.click(screen.getByText('Guide'));
  await screen.findByRole('heading', { name: 'Guide ST-J' });
  expect(output('guide-context')).toEqual({ stationId: 'ST-J', journeyDecisionId: 'decision-1', originLatitude: null, originLongitude: null, minutesAhead: null, requiredBikeCount: null });
  await act(async () => { window.history.go(-2); });
  await screen.findByRole('heading', { name: 'Result decision-1' });
  expect(output('result-initial')).toBeNull();
  expect(mockLoadDecision.mock.calls.length).toBeGreaterThan(initialLoads);
});

test('Header Ride reuses the station or guide context already on screen without a fixture id', async () => {
  visit('/#station/ST-9');
  await screen.findByRole('heading', { name: 'Station ST-9' });
  fireEvent.click(screen.getByText('Header ride'));
  expect(await screen.findByRole('heading', { name: 'Ride ST-9' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#ride/ST-9');

  fireEvent.click(screen.getByText('Guide'));
  await screen.findByRole('heading', { name: 'Guide ST-9' });
  fireEvent.click(screen.getByText('Header ride'));
  expect(await screen.findByRole('heading', { name: 'Ride ST-9' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#ride/ST-9');
});

test('Header Ride with no station context lands on Main with a one-time guidance instead of a silent no-op', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Header ride'));
  expect(window.location.hash).toBe('');
  expect(await screen.findByText('라이딩을 보려면 먼저 대여소를 선택해 주세요.')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Alerts'));
  await screen.findByRole('heading', { name: 'Alerts' });
  fireEvent.click(screen.getByText('Home'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(screen.queryByText('라이딩을 보려면 먼저 대여소를 선택해 주세요.')).not.toBeInTheDocument();
});

test('a ride guidance shown after Header Ride does not leak into an unrelated Main visit reached via browser back', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Header ride'));
  expect(await screen.findByText('라이딩을 보려면 먼저 대여소를 선택해 주세요.')).toBeInTheDocument();
  await act(async () => { window.history.back(); });
  await waitFor(() => expect(screen.queryByText('라이딩을 보려면 먼저 대여소를 선택해 주세요.')).not.toBeInTheDocument());
});
