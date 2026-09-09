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
  LoginPage: ({ adapter }) => {
    const React = require('react');
    const [authenticated, setAuthenticated] = React.useState(false);
    const [logoutState, setLogoutState] = React.useState('idle');
    React.useEffect(() => { adapter.checkSession().then((auth) => setAuthenticated(auth.authenticated)); }, [adapter]);
    const performLogout = async () => {
      try { await adapter.logout(); setLogoutState('success'); } catch { setLogoutState('failed'); }
    };
    return <section><h1>Login</h1><output data-testid="login-logout-state">{logoutState}</output>{authenticated ? <button onClick={performLogout}>Login page logout</button> : null}</section>;
  },
  OpeningPage: ({ onNavigate, onStart }) => <section><h1>Opening</h1><button onClick={onStart}>Opening CTA</button><button onClick={() => onNavigate('ride')}>Header ride</button></section>,
}));
jest.mock('./features/consumer-r2/main/ConsumerMainPage', () => function MockMain({ currentResult, currentView, onInputChange, onNavigate, onOpenGuide, onOpenRide, onOpenStation, onSearchComplete, onStartNew, onViewChange, restoreSearch }) {
  const [liveCandidate, setLiveCandidate] = require('react').useState(null);
  require('react').useEffect(() => { mockMainRestoreChange(); }, [restoreSearch, currentResult]);
  return <section>
  <h1>Main</h1><output>{restoreSearch?.origin?.displayName || (typeof restoreSearch?.origin === 'string' ? restoreSearch.origin : '')}</output>
  <output data-testid="main-input">{JSON.stringify(restoreSearch || null)}</output><output data-testid="main-result">{JSON.stringify(currentResult || null)}</output><output data-testid="main-view">{JSON.stringify(currentView || null)}</output>
  <button onClick={() => onOpenStation(liveCandidate || currentResult?.candidates?.[0] || { stationId: 'ST-1' }, restoreSearch)}>Station</button>
  <button onClick={() => onOpenRide(liveCandidate || currentResult?.candidates?.[0] || { stationId: 'ST-1' }, restoreSearch)}>Ride</button>
  <button onClick={() => onOpenGuide(currentResult?.candidates?.find((candidate) => candidate.stationId === currentView?.selectedStationId) || liveCandidate || currentResult?.candidates?.[0] || { stationId: 'ST-1' }, restoreSearch)}>Direct guide</button>
  <button onClick={() => { onInputChange(mockInputA); onSearchComplete(mockInputA, mockResultA); setLiveCandidate(mockResultA.candidates[0]); }}>Search A</button>
  <button onClick={() => onInputChange(mockInputA)}>Enter A</button>
  <button onClick={() => { const input = { ...mockInputA, origin: '수정 중' }; onInputChange(input); onSearchComplete(input, null); }}>Edit input</button>
  <button onClick={() => onNavigate('alerts')}>Alerts</button>
  <button onClick={() => onNavigate('planner')}>Planner</button>
  <button onClick={() => onNavigate('archive')}>Archive</button>
  <button onClick={() => onNavigate('mypage')}>Account</button>
  <button onClick={() => onNavigate('ride')}>Header ride</button>
  <button onClick={() => onNavigate('home')}>Header home</button>
  <button onClick={() => onViewChange({ selectedStationId: 'ST-B', sortKey: 'DISTANCE', showTransit: true })}>Change result view</button>
  <button onClick={onStartNew}>New comparison</button>
</section>;
});
jest.mock('./features/consumer-r2/station/StationDetailPage', () => ({ stationId, onNavigate }) => <section><h1>Station {stationId}</h1><button onClick={() => onNavigate('ride', stationId)}>Ride</button><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={() => onNavigate('main')}>Back to results</button><button onClick={() => onNavigate('mypage')}>Account</button><button onClick={() => onNavigate('home')}>Home</button></section>);
jest.mock('./features/consumer-r2/ride/RideExplorePage', () => ({ stationId, onNavigate }) => <section><h1>Ride {stationId}</h1><button onClick={() => onNavigate('guide', stationId)}>Guide</button><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={() => onNavigate('main')}>Back to results</button><button onClick={() => onNavigate('home')}>Home</button></section>);
jest.mock('./features/consumer-r2/guide/ConsumerRidingGuidePage', () => ({ stationId, guideContext, onNavigate, returnRoute }) => <section><h1>Guide {stationId}</h1><output data-testid="guide-context">{JSON.stringify(guideContext)}</output><output data-testid="guide-return">{returnRoute || 'ride'}</output><button onClick={() => returnRoute === 'main' ? onNavigate('main') : onNavigate('ride', stationId)}>Guide back</button><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={() => onNavigate('main')}>Back to results</button><button onClick={() => onNavigate('home')}>Home</button></section>);
jest.mock('./features/consumer-r2/journey', () => {
  const { useEffect } = require('react');
  return {
    ConsumerJourneyPlannerPage: ({ onNavigate, onResult, initialInput }) => <section><h1>Planner active</h1><output data-testid="planner-input">{JSON.stringify(initialInput)}</output><button onClick={() => { onResult(mockDecision); onNavigate('journey-result', mockDecision.decisionId); }}>Result</button></section>,
    ConsumerJourneyPlanResultPage: ({ decisionId, initialDecision, onResult, onNavigate }) => {
      useEffect(() => { if (!initialDecision) mockLoadDecision(decisionId); if (decisionId === mockDecision.decisionId) onResult(initialDecision || mockDecision); }, [decisionId, initialDecision, onResult]);
      return <section><h1>Result {decisionId}</h1><output data-testid="result-initial">{JSON.stringify(initialDecision || null)}</output><button onClick={() => onNavigate('ride', 'ST-J')}>Selected ride</button><button onClick={() => onNavigate('ride')}>Header ride</button></section>;
    },
  };
});
jest.mock('./features/consumer-r2/personal', () => ({
  PersonalArchivePage: ({ authState, onNavigate, onReplay }) => <section><h1>Archive {authState}</h1>
    <button onClick={() => onNavigate('main', { restoreSearch: { origin: { displayName: '서울역' } } })}>Restore search</button>
    <button onClick={() => onReplay({ decisionId: 'replay-1' })}>Replay</button>
    <button onClick={() => onNavigate('ride')}>Header ride</button>
  </section>,
  PersonalMyPage: ({ adapter, onNavigate }) => <section><h1>Account</h1><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={async () => { await adapter.logout(); onNavigate('archive'); }}>Logout</button><button onClick={async () => { await adapter.logout(); onNavigate('main'); }}>Logout to main</button></section>,
}));
jest.mock('./features/consumer-r2/support', () => ({
  ConsumerQnaPage: ({ initialQuestionId, onNavigate }) => <section><h1>Qna {initialQuestionId}</h1><button onClick={() => onNavigate('ride')}>Header ride</button></section>,
  ConsumerAlertsPage: ({ onNavigate, onCurrentData, searchInput }) => <section><h1>Alerts</h1><output data-testid="alerts-input">{JSON.stringify(searchInput || null)}</output><button onClick={() => onNavigate('qna', { questionId: 'q1' })}>Answer</button><button onClick={() => onCurrentData({ kind: 'SEARCH_RECHECK', result: mockResultA }, mockInputA)}>Recheck A</button><button onClick={() => onCurrentData({ kind: 'SEARCH_RECHECK', result: mockResultB }, mockInputB)}>Recheck B</button><button onClick={() => onNavigate('ride')}>Header ride</button><button onClick={() => onNavigate('main')}>Back to results</button><button onClick={() => onNavigate('home')}>Home</button></section>,
}));

const mockInputA = { origin: { providerId: 'origin-A', displayName: '출발 A', latitude: 37.55, longitude: 126.97 }, destination: { providerId: 'anchor-A', displayName: '대여 기준 A', latitude: 37.57, longitude: 126.98 }, travelMode: 'WALK', requiredBikeCount: 3 };
const mockInputB = { ...mockInputA, origin: { providerId: 'origin-B', displayName: '출발 B', latitude: 37.61, longitude: 127.02 }, requiredBikeCount: 2 };
const mockNow = Date.parse('2030-09-03T00:40:00Z');
let mockResultA;
let mockResultB;
const mockLoadDecision = jest.fn();
const mockMainRestoreChange = jest.fn();
const mockDecision = { decisionId: 'decision-1', revision: 1, expiresAt: '2030-09-03T01:05:00Z', normalizedIntent: { origin: { placeId: 'journey-origin', displayName: '일정 출발지', latitude: 37.62, longitude: 127.03 }, requiredBikeCount: 4 }, candidates: [{ candidateId: 'candidate-id-is-not-station', stationId: 'ST-J', arrivalAt: '2030-09-03T01:00:00Z', horizonMinutes: 120, requiredBikeCount: 4, rentalProbability: 0.91 }], unifiedPlan: { selectedRentalCandidateId: 'rental:ST-J', segments: [] } };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

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

test('/ is the HOME landing and its CTA opens a fresh Prediction main', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Opening' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Opening CTA'));
  expect(await screen.findByRole('heading', { name: 'Main' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#main');
});

test('a stored intro-seen flag cannot hide the HOME landing', async () => {
  window.localStorage.setItem(INTRO_SEEN_KEY, 'true');
  window.history.replaceState({}, '', '/');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Opening' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Main' })).not.toBeInTheDocument();
});

test('the landing never advances on its own, however long the visitor waits', async () => {
  jest.useFakeTimers();
  try {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Opening' })).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(screen.getByRole('heading', { name: 'Opening' })).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(screen.getByRole('heading', { name: 'Opening' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  } finally {
    jest.useRealTimers();
  }
});

test.each(['#main', '#station/ST-1', '#ride/ST-1', '#alerts'])('HOME returns to the landing from %s', async (hash) => {
  visit('/' + hash);
  fireEvent.click(await screen.findByText(hash === '#main' ? 'Header home' : 'Home'));
  expect(await screen.findByRole('heading', { name: 'Opening' })).toBeInTheDocument();
  expect(window.location.hash).toBe('');
});

test.each([
  ['/login', 'Login'], ['/', 'Opening'], ['/#main', 'Main'], ['/#station/ST-1', 'Station ST-1'],
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
  visit('/#main');
  fireEvent.click(await screen.findByText('Station'));
  expect(await screen.findByRole('heading', { name: 'Station ST-1' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#station/ST-1');
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  fireEvent.click(screen.getByText('Ride'));
  expect(await screen.findByRole('heading', { name: 'Ride ST-1' })).toBeInTheDocument();
});

test.each(['ANONYMOUS', 'FREE'])('C01 direct Guide keeps the existing %s Premium gate', async (state) => {
  if (state === 'ANONYMOUS') getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  else fetchSubscription.mockResolvedValue({ status: state });
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Direct guide'));

  expect(await screen.findByRole('heading', { name: 'Gate ' + state })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /Guide ST/ })).not.toBeInTheDocument();
});

test('C01 direct Guide uses the selected candidate and returns to the same RESULT view', async () => {
  mockResultA.candidates.push({ stationId: 'ST-B', horizonMinutes: 90, predictionProbability: 0.74, arrivalAt: '2030-09-03T01:03:00Z', expiresAt: '2030-09-03T01:01:00Z', routeDetail: { pathPoints: [[37.55, 126.97], [37.57, 126.98]] } });
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Change result view'));
  fireEvent.click(screen.getByText('Direct guide'));

  expect(await screen.findByRole('heading', { name: 'Guide ST-B' })).toBeInTheDocument();
  expect(screen.getByTestId('guide-return')).toHaveTextContent('main');
  expect(output('guide-context')).toEqual(expect.objectContaining({ stationId: 'ST-B', requiredBikeCount: 3 }));
  expect(JSON.stringify(window.history.state)).not.toMatch(/predictionProbability|arrivalAt|candidates/);

  fireEvent.click(screen.getByText('Guide back'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-result')).toEqual(mockResultA);
  expect(output('main-view')).toEqual({ selectedStationId: 'ST-B', sortKey: 'DISTANCE', showTransit: true });
});

test('Ride Explore Guide keeps its existing return to the selected ride station', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  fireEvent.click(await screen.findByText('Guide'));

  expect(await screen.findByRole('heading', { name: 'Guide ST-A' })).toBeInTheDocument();
  expect(screen.getByTestId('guide-return')).toHaveTextContent('ride');
  fireEvent.click(screen.getByText('Guide back'));
  expect(await screen.findByRole('heading', { name: 'Ride ST-A' })).toBeInTheDocument();
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

test('logout clears the fresh RESULT, locations, selected station, and view from the anonymous session', async () => {
  mockResultA.candidates.push({ stationId: 'ST-B', horizonMinutes: 90, predictionProbability: 0.74, arrivalAt: '2030-09-03T01:03:00Z', expiresAt: '2030-09-03T01:01:00Z', featureAsOf: '2030-09-03T00:39:00Z', routeDetail: { pathPoints: [[37.55, 126.97], [37.57, 126.98]], durationMinutes: 23 } });
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Change result view'));
  const priorSessionId = window.history.state.searchSessionId;
  fireEvent.click(screen.getByText('Account'));
  fireEvent.click(await screen.findByText('Logout to main'));

  await screen.findByRole('heading', { name: 'Main' });
  expect(window.location.hash).toBe('#main');
  expect(window.history.state.searchSessionId).not.toBe(priorSessionId);
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
  expect(output('main-view')).toBeNull();
  expect(window.history.state).not.toEqual(expect.objectContaining({
    restoreSearch: expect.anything(),
    selectedStationId: expect.anything(),
    mainView: expect.anything(),
  }));
  expect(JSON.stringify(window.history.state)).not.toMatch(/latitude|longitude|predictionProbability/);
  expect(logout).toHaveBeenCalledTimes(1);
});

test('logout removes only the current user cache and preserves login-return input', async () => {
  const currentUserCache = 'ddarung.consumer-r2.recent-search.v1.test-user';
  const otherUserCache = 'ddarung.consumer-r2.recent-search.v1.other-user';
  const pendingLoginInput = 'ddarung.pendingPrediction.v1';
  const journeyDraft = 'consumer-journey-planner-draft';
  const pendingLoginInputValue = ' {"origin":"로그인 전 입력","requiredBikeCount":2}\n';
  window.localStorage.setItem(currentUserCache, JSON.stringify([mockInputA]));
  window.localStorage.setItem(otherUserCache, JSON.stringify([mockInputB]));
  window.sessionStorage.setItem(pendingLoginInput, pendingLoginInputValue);
  window.sessionStorage.setItem(journeyDraft, JSON.stringify({ text: '이전 사용자 일정' }));

  const view = visit('/#mypage');
  fireEvent.click(await screen.findByText('Logout'));
  await screen.findByRole('heading', { name: 'Archive anonymous' });

  expect(window.localStorage.getItem(currentUserCache)).toBeNull();
  expect(window.localStorage.getItem(otherUserCache)).not.toBeNull();
  expect(window.sessionStorage.getItem(journeyDraft)).toBeNull();
  expect(window.sessionStorage.getItem(pendingLoginInput)).toBe(pendingLoginInputValue);

  view.unmount();
  getCurrentUser.mockResolvedValue({ authenticated: true, user: { id: 'next-user' } });
  visit('/#journey');
  await screen.findByRole('heading', { name: 'Planner active' });
  expect(window.sessionStorage.getItem(journeyDraft)).toBeNull();
});

test('logout from the actual login route uses the same privacy cleanup', async () => {
  const currentUserCache = 'ddarung.consumer-r2.recent-search.v1.test-user';
  const otherUserCache = 'ddarung.consumer-r2.recent-search.v1.other-user';
  const pendingLoginInput = 'ddarung.pendingPrediction.v1';
  const journeyDraft = 'consumer-journey-planner-draft';
  const pendingLoginInputValue = '{"destination":"로그인 복귀 입력"}';
  window.localStorage.setItem(currentUserCache, 'current');
  window.localStorage.setItem(otherUserCache, 'other');
  window.sessionStorage.setItem(pendingLoginInput, pendingLoginInputValue);
  window.sessionStorage.setItem(journeyDraft, 'private draft');

  visit('/login');
  fireEvent.click(await screen.findByText('Login page logout'));

  await waitFor(() => {
    expect(logout).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(currentUserCache)).toBeNull();
    expect(window.localStorage.getItem(otherUserCache)).toBe('other');
    expect(window.sessionStorage.getItem(journeyDraft)).toBeNull();
    expect(window.sessionStorage.getItem(pendingLoginInput)).toBe(pendingLoginInputValue);
  });
});

test('the login route shares one session request so logout clears the authenticated user cache', async () => {
  const sharedSession = deferred();
  getCurrentUser.mockImplementationOnce(() => sharedSession.promise);
  const currentUserCache = 'ddarung.consumer-r2.recent-search.v1.test-user';
  const otherUserCache = 'ddarung.consumer-r2.recent-search.v1.other-user';
  const pendingLoginInput = 'ddarung.pendingPrediction.v1';
  const journeyDraft = 'consumer-journey-planner-draft';
  const pendingValue = ' {"origin":"로그인 복귀"}\n';
  window.localStorage.setItem(currentUserCache, 'current');
  window.localStorage.setItem(otherUserCache, 'other');
  window.sessionStorage.setItem(pendingLoginInput, pendingValue);
  window.sessionStorage.setItem(journeyDraft, 'private draft');

  visit('/login');
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
  await act(async () => { sharedSession.resolve({ authenticated: true, user: { id: 'test-user' } }); });
  fireEvent.click(await screen.findByText('Login page logout'));
  await waitFor(() => expect(screen.getByTestId('login-logout-state')).toHaveTextContent('success'));

  await act(async () => {
    window.history.pushState({}, '', '/#guide/ST-1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  expect(await screen.findByRole('heading', { name: 'Gate ANONYMOUS' })).toBeInTheDocument();
  expect(window.localStorage.getItem(currentUserCache)).toBeNull();
  expect(window.localStorage.getItem(otherUserCache)).toBe('other');
  expect(window.sessionStorage.getItem(journeyDraft)).toBeNull();
  expect(window.sessionStorage.getItem(pendingLoginInput)).toBe(pendingValue);
});

test('a rejected login-page logout clears no browser state', async () => {
  logout.mockRejectedValueOnce(new Error('logout failed'));
  const currentUserCache = 'ddarung.consumer-r2.recent-search.v1.test-user';
  const otherUserCache = 'ddarung.consumer-r2.recent-search.v1.other-user';
  const pendingLoginInput = 'ddarung.pendingPrediction.v1';
  const journeyDraft = 'consumer-journey-planner-draft';
  window.localStorage.setItem(currentUserCache, 'current');
  window.localStorage.setItem(otherUserCache, 'other');
  window.sessionStorage.setItem(pendingLoginInput, 'pending');
  window.sessionStorage.setItem(journeyDraft, 'draft');

  visit('/login');
  fireEvent.click(await screen.findByText('Login page logout'));
  await waitFor(() => expect(screen.getByTestId('login-logout-state')).toHaveTextContent('failed'));

  expect(window.localStorage.getItem(currentUserCache)).toBe('current');
  expect(window.localStorage.getItem(otherUserCache)).toBe('other');
  expect(window.sessionStorage.getItem(pendingLoginInput)).toBe('pending');
  expect(window.sessionStorage.getItem(journeyDraft)).toBe('draft');
});

test.each(['expired RESULT', 'input in progress'])('logout does not migrate %s into the anonymous session', async (scenario) => {
  if (scenario === 'expired RESULT') {
    mockResultA.candidates[0].expiresAt = '2030-09-03T00:40:00Z';
  }
  visit('/#main');
  fireEvent.click(await screen.findByText(scenario === 'expired RESULT' ? 'Search A' : 'Enter A'));
  fireEvent.click(screen.getByText('Account'));
  fireEvent.click(await screen.findByText('Logout to main'));

  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
  expect(output('main-view')).toBeNull();
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
  expect(navigationTarget('home')).toEqual({ hash: '', route: 'home', stationId: null });
  expect(navigationTarget('main')).toEqual({ hash: '#main', route: 'main', stationId: null });
  expect(navigationTarget('home')).not.toEqual(navigationTarget('main'));
  expect(routeFromHash('')).toEqual(navigationTarget('home'));
  expect(routeFromHash('#main')).toEqual(navigationTarget('main'));
  expect(navigationTarget('ride')).toEqual(navigationTarget('main'));
  expect(navigationTarget('ride', 'ST-1').hash).toBe('#ride/ST-1');
  expect(normalizeConsumerReturn('//evil.example')).toBeNull();
  expect(normalizeConsumerReturn('/admin')).toBeNull();
  expect(normalizeConsumerReturn('/login')).toBeNull();
  storeConsumerReturn('/#guide/ST-1');
  expect(consumeConsumerReturn()).toBe('/#guide/ST-1');
  expect(consumeConsumerReturn()).toBeNull();
});

test('Main results and complete selected input survive Station and browser back', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-A' });
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toEqual(mockResultA);
});

test('Ride and back-to-results retain the related Main input/result, while refresh retains input only', async () => {
  const view = visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  fireEvent.click(screen.getByText('Back to results'));
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
  await act(async () => { window.history.forward(); });
  await screen.findByRole('heading', { name: 'Alerts' });
  await act(async () => { window.history.forward(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputB);
  expect(output('main-result')).toEqual(mockResultB);
});

test('explicit archive restoration never receives the preceding Main result', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Archive'));
  fireEvent.click(await screen.findByText('Restore search'));
  expect(output('main-result')).toBeNull();
  expect(output('main-input').origin).toBe('서울역');
});

test('editing a search invalidates its memory result and preserves partial input', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Edit input'));
  expect(output('main-result')).toBeNull();
  expect(output('main-input').origin).toBe('수정 중');
  fireEvent.click(screen.getByText('Alerts'));
  fireEvent.click(await screen.findByText('Back to results'));
  expect(output('main-result')).toBeNull();
  expect(output('main-input').origin).toBe('수정 중');
});

test('Guide uses remaining arrival time and clears relative time after refreshed mount', async () => {
  const view = visit('/#main');
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
  visit('/#main');
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
  visit('/#main');
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
  visit('/#main');
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
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Ride'));
  await screen.findByRole('heading', { name: 'Ride ST-A' });
  Date.now.mockReturnValue(Date.parse(now));
  fireEvent.click(screen.getByText('Back to results'));
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
  visit('/#main');
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

test.each(['#station/ST-9', '#ride/ST-9', '#guide/ST-9', '#journey/result/decision-1'])('global RIDING from %s starts a new prediction instead of inheriting that station', async (hash) => {
  visit('/' + hash);
  fireEvent.click(await screen.findByText('Header ride'));
  expect(await screen.findByRole('heading', { name: 'Main' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#main');
  expect(window.history.state.selectedStationId).toBeUndefined();
});

test('an explicit station ride still opens that station RideExplore', async () => {
  visit('/#station/ST-9');
  await screen.findByRole('heading', { name: 'Station ST-9' });
  fireEvent.click(screen.getByText('Ride'));
  expect(await screen.findByRole('heading', { name: 'Ride ST-9' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#ride/ST-9');
});

test('active global RIDING is a no-op that preserves the fresh RESULT and history entry', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  expect(output('main-result')).toEqual(mockResultA);
  const entryId = window.history.state.entryId;

  fireEvent.click(screen.getByText('Header ride'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(window.location.hash).toBe('#main');
  expect(window.history.state.entryId).toBe(entryId);
  expect(output('main-result')).toEqual(mockResultA);
  expect(output('main-input')).toEqual(mockInputA);
});

test('active global RIDING invalidates a RESULT exactly at expiry without adding history', async () => {
  mockResultA.candidates[0].expiresAt = '2030-09-03T00:45:00Z';
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  const entryId = window.history.state.entryId;
  const historyLength = window.history.length;
  Date.now.mockReturnValue(Date.parse('2030-09-03T00:45:00Z'));

  fireEvent.click(screen.getByText('Header ride'));
  await waitFor(() => expect(window.history.state.entryId).not.toBe(entryId));
  expect(window.history.length).toBe(historyLength);
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toBeNull();
  expect(output('main-view')).toBeNull();
});

test('logout replaces an older selected-station history entry before Back or Forward can expose it', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  const priorSessionId = window.history.state.searchSessionId;
  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-A' });
  fireEvent.click(screen.getByText('Account'));
  fireEvent.click(await screen.findByText('Logout'));
  await screen.findByRole('heading', { name: 'Archive anonymous' });
  const historyLength = window.history.length;

  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Account' });
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  await waitFor(() => expect(window.history.state.searchSessionId).not.toBe(priorSessionId));
  expect(window.location.hash).toBe('#main');
  expect(window.history.length).toBe(historyLength);
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
  expect(output('main-view')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Station ST-A' })).not.toBeInTheDocument();

  await act(async () => { window.history.forward(); });
  await screen.findByRole('heading', { name: 'Account' });
  await act(async () => { window.history.forward(); });
  await screen.findByRole('heading', { name: 'Archive anonymous' });
  expect(screen.queryByRole('heading', { name: 'Station ST-A' })).not.toBeInTheDocument();
});

test('logout clears old Main state but preserves the HOME route across Back and Forward', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Opening CTA'));
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Account'));
  fireEvent.click(await screen.findByText('Logout'));
  await screen.findByRole('heading', { name: 'Archive anonymous' });

  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Account' });
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Opening' });
  expect(window.location.pathname + window.location.hash).toBe('/');

  await act(async () => { window.history.forward(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
});

test.each([
  ['HOME', 'home', 'Opening'],
  ['mypage', 'mypage', 'Account'],
  ['Q&A', 'qna', 'Qna'],
  ['alerts', 'alerts', 'Alerts'],
])('input in progress survives %s and global RIDING', async (_label, destination, heading) => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Enter A'));
  if (destination === 'mypage') fireEvent.click(screen.getByText('Account'));
  else if (destination === 'qna') { fireEvent.click(screen.getByText('Alerts')); fireEvent.click(await screen.findByText('Answer')); }
  else if (destination === 'alerts') fireEvent.click(screen.getByText('Alerts'));
  else fireEvent.click(screen.getByText('Header home'));
  await screen.findByRole('heading', { name: new RegExp(heading) });
  fireEvent.click(screen.getByText('Header ride'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toBeNull();
});

test.each([
  ['HOME', 'home', 'Opening'],
  ['mypage', 'mypage', 'Account'],
  ['Q&A', 'qna', 'Qna'],
  ['alerts', 'alerts', 'Alerts'],
])('fresh multi-candidate RESULT and its selected/sort/route-detail view survive %s and RIDING', async (_label, destination, heading) => {
  mockResultA.candidates.push({ stationId: 'ST-B', horizonMinutes: 90, predictionProbability: 0.74, arrivalAt: '2030-09-03T01:03:00Z', expiresAt: '2030-09-03T01:01:00Z', featureAsOf: '2030-09-03T00:39:00Z', routeDetail: { pathPoints: [[37.55, 126.97], [37.57, 126.98]], durationMinutes: 23 } });
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Change result view'));
  if (destination === 'mypage') fireEvent.click(screen.getByText('Account'));
  else if (destination === 'qna') { fireEvent.click(screen.getByText('Alerts')); fireEvent.click(await screen.findByText('Answer')); }
  else if (destination === 'alerts') fireEvent.click(screen.getByText('Alerts'));
  else fireEvent.click(screen.getByText('Header home'));
  await screen.findByRole('heading', { name: new RegExp(heading) });
  fireEvent.click(screen.getByText('Header ride'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toEqual(mockInputA);
  expect(output('main-result')).toEqual(mockResultA);
  expect(output('main-view')).toEqual({ selectedStationId: 'ST-B', sortKey: 'DISTANCE', showTransit: true });
});

test('explicit new comparison creates an empty entry and never resumes the previous RESULT', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  const resultEntry = window.history.state.entryId;
  fireEvent.click(screen.getByText('New comparison'));
  expect(window.history.state.entryId).not.toBe(resultEntry);
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
  await act(async () => { window.history.back(); });
  await waitFor(() => expect(window.history.state.entryId).toBe(resultEntry));
  expect(output('main-result')).toEqual(mockResultA);
  await act(async () => { window.history.forward(); });
  await waitFor(() => expect(window.history.state.entryId).not.toBe(resultEntry));
  expect(output('main-result')).toBeNull();
  fireEvent.click(screen.getByText('Header home'));
  fireEvent.click(await screen.findByText('Header ride'));
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
});

test('HOME and the in-screen back land in different places from the same Station', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-A' });

  fireEvent.click(screen.getByText('Back to results'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-result')).toEqual(mockResultA);
  expect(window.location.hash).toBe('#main');

  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-A' });
  fireEvent.click(screen.getByText('Home'));
  expect(await screen.findByRole('heading', { name: 'Opening' })).toBeInTheDocument();
  expect(window.location.hash).toBe('');
});

test('the landing keeps no search to restore, so its CTA opens an empty INITIAL', async () => {
  visit('/#main');
  fireEvent.click(await screen.findByText('Search A'));
  fireEvent.click(screen.getByText('Header home'));
  await screen.findByRole('heading', { name: 'Opening' });

  fireEvent.click(screen.getByText('Opening CTA'));
  await screen.findByRole('heading', { name: 'Main' });
  expect(output('main-input')).toBeNull();
  expect(output('main-result')).toBeNull();
});

test('back and forward keep HOME and Prediction main as distinct routes', async () => {
  visit('/');
  fireEvent.click(await screen.findByText('Opening CTA'));
  await screen.findByRole('heading', { name: 'Main' });
  fireEvent.click(screen.getByText('Station'));
  await screen.findByRole('heading', { name: 'Station ST-1' });

  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(window.location.hash).toBe('#main');

  await act(async () => { window.history.back(); });
  await screen.findByRole('heading', { name: 'Opening' });
  expect(window.location.hash).toBe('');

  await act(async () => { window.history.forward(); });
  await screen.findByRole('heading', { name: 'Main' });
  expect(window.location.hash).toBe('#main');
});
