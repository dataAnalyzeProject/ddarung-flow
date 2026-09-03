import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoginPage, OpeningPage } from './features/consumer-r2/entry';
import ConsumerMainPage from './features/consumer-r2/main/ConsumerMainPage';
import StationDetailPage from './features/consumer-r2/station/StationDetailPage';
import RideExplorePage from './features/consumer-r2/ride/RideExplorePage';
import ConsumerRidingGuidePage from './features/consumer-r2/guide/ConsumerRidingGuidePage';
import { ConsumerJourneyPlannerPage, ConsumerJourneyPlanResultPage } from './features/consumer-r2/journey';
import { PersonalArchivePage, PersonalMyPage } from './features/consumer-r2/personal';
import { ConsumerQnaPage, ConsumerAlertsPage } from './features/consumer-r2/support';
import { PremiumAccessGatePage, PremiumSandboxCheckoutPage } from './features/consumer-r2/premium';
import { AsyncState, ConsumerContainer, ConsumerR2Theme } from './features/consumer-r2/shared';
import { consumerPersonalAdapter } from './features/consumer-r2/adapters/personal/consumerPersonalAdapter';
import { candidateGuideContext, consumerHistoryState, consumeConsumerReturn, guideContextForStation, isFreshMainResult, isFutureTimestamp, journeyHistoryInput, navigationTarget, newConsumerEntryId, routeFromHash, searchHistoryInput, storeConsumerReturn } from './features/consumer-r2/adapters/navigation/consumerNavigation';
import AdminV2PreviewApp from './features/admin-v2/shell/AdminV2PreviewApp';
import AdminV2ProductionApp from './features/admin-v2/shell/AdminV2ProductionApp';
import { isAdminV2PreviewPath, isAdminV2ProductionPath } from './features/admin-v2/routes/routeMap';
import { hasSeenIntro } from './features/intro/introStorage';
import { getCurrentUser, logout } from './features/login/authApi';
import { fetchSubscription } from './features/premium/subscriptionApi';
import { clearAdminReturnTarget, consumeAdminReturnTarget } from './features/admin-v2/auth/adminSession';

export { navigationTarget } from './features/consumer-r2/adapters/navigation/consumerNavigation';

function readLocation() {
  if (window.location.pathname !== '/') return { pathname: window.location.pathname, ...routeFromHash(), state: window.history.state || {} };
  const state = consumerHistoryState(window.history.state);
  if (!state.entryId) state.entryId = newConsumerEntryId();
  if (JSON.stringify(state) !== JSON.stringify(window.history.state)) window.history.replaceState(state, '');
  return { pathname: window.location.pathname, ...routeFromHash(), state };
}

function decisionNavigationState(decision) {
  const candidate = decision?.candidates?.find((item) => `rental:${item.stationId}` === decision.unifiedPlan?.selectedRentalCandidateId);
  return {
    journeyDecisionId: decision?.decisionId,
    journeyInput: journeyHistoryInput(decision?.normalizedIntent),
    selectedStationId: candidate?.stationId,
    guideContext: candidate ? candidateGuideContext(candidate.stationId, candidate, decision.normalizedIntent, decision.decisionId) : undefined,
  };
}

function App() {
  const [location, setLocation] = useState(readLocation);
  const [authState, setAuthState] = useState('loading');
  const [user, setUser] = useState(null);
  const [introComplete, setIntroComplete] = useState(() => hasSeenIntro());
  const [subscription, setSubscription] = useState({ status: 'PROCESSING' });
  const [subscriptionReload, setSubscriptionReload] = useState(0);
  const mainResults = useRef(new Map());
  const decisions = useRef(new Map());
  const isLoginPath = location.pathname === '/login';
  const isAdminV2Preview = isAdminV2PreviewPath(location.pathname);
  const isAdminV2Production = isAdminV2ProductionPath(location.pathname);
  const skipSessionCheck = isAdminV2Preview || isAdminV2Production;
  const { route, stationId } = location;
  const protectedAi = ['journey', 'journey-result', 'guide'].includes(route);
  const needsSubscription = protectedAi || route === 'checkout';

  const syncLocation = useCallback(() => setLocation(readLocation()), []);
  useEffect(() => {
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('popstate', syncLocation);
    return () => {
      window.removeEventListener('hashchange', syncLocation);
      window.removeEventListener('popstate', syncLocation);
    };
  }, [syncLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isLoginPath) storeConsumerReturn(params.get('returnTo'));
    if (params.get('login') === 'success') {
      const target = consumeAdminReturnTarget() || consumeConsumerReturn();
      if (target) window.location.replace(target);
    }
    if (['failed', 'cancelled'].includes(params.get('login'))) clearAdminReturnTarget();
  }, [isLoginPath]);

  const refreshSession = useCallback(() => {
    setAuthState('loading');
    return getCurrentUser().then((auth) => {
      setUser(auth.authenticated ? auth.user : null);
      setAuthState(auth.authenticated ? 'authenticated' : 'anonymous');
    }).catch(() => { setUser(null); setAuthState('error'); });
  }, []);
  useEffect(() => {
    if (!skipSessionCheck) refreshSession();
  }, [skipSessionCheck, refreshSession]);

  useEffect(() => {
    if (!needsSubscription || authState !== 'authenticated' || skipSessionCheck) return undefined;
    let active = true;
    setSubscription({ status: 'PROCESSING' });
    fetchSubscription().then((value) => {
      if (active) setSubscription(value?.status ? value : { status: 'ERROR' });
    }).catch(() => { if (active) setSubscription({ status: 'ERROR' }); });
    return () => { active = false; };
  }, [needsSubscription, authState, route, stationId, subscriptionReload, skipSessionCheck]);

  const resultFor = useCallback((state, entryId = state.entryId) => {
    const saved = mainResults.current.get(entryId);
    return saved && saved.inputKey === JSON.stringify(state.restoreSearch) && isFreshMainResult(saved.result) ? saved.result : null;
  }, []);
  const restoreKey = JSON.stringify(location.state.restoreSearch || null);
  const restoreSearch = useMemo(() => JSON.parse(restoreKey), [restoreKey]);
  const entryId = location.state.entryId;
  const restoredMainResult = useMemo(() => resultFor({ entryId, restoreSearch }), [entryId, restoreSearch, resultFor]);
  const decisionStateFor = (decisionId) => {
    const saved = decisions.current.get(decisionId);
    return saved && isFutureTimestamp(saved.expiresAt) ? saved.state : null;
  };
  const guideFor = (state, selectedId) => {
    const storedContext = guideContextForStation(state.guideContext, selectedId);
    if (storedContext.journeyDecisionId) {
      const remembered = decisionStateFor(storedContext.journeyDecisionId)?.guideContext;
      return remembered?.stationId === selectedId ? remembered
        : guideContextForStation({ stationId: selectedId, journeyDecisionId: storedContext.journeyDecisionId }, selectedId);
    }
    const result = resultFor(state, state.mainEntryId || state.entryId);
    const candidate = result?.candidates.find((item) => item.stationId === selectedId);
    return candidate ? candidateGuideContext(selectedId, candidate, state.restoreSearch) : {};
  };
  const navigate = (nextRoute, id, suppliedResult) => {
    if (nextRoute === 'admin') { window.location.assign('/admin'); return; }
    if (nextRoute === 'login') {
      const target = storeConsumerReturn('/' + window.location.hash) || '/';
      window.location.assign('/login?returnTo=' + encodeURIComponent(target));
      return;
    }
    const source = readLocation();
    const candidateId = ['ride', 'guide', 'station'].includes(nextRoute) && !id ? source.state.selectedStationId || (['station', 'ride', 'guide'].includes(source.route) ? source.stationId : null) : id;
    const target = navigationTarget(nextRoute, candidateId);
    const mainEntryId = source.route === 'main' ? source.state.entryId : source.state.mainEntryId;
    let state = { ...source.state, entryId: newConsumerEntryId(), mainEntryId };
    delete state.questionId;
    if (target.route === 'main') {
      const restoring = Boolean(id?.restoreSearch);
      const input = searchHistoryInput(restoring ? id.restoreSearch : source.state.restoreSearch);
      const result = restoring ? suppliedResult : resultFor(source.state, mainEntryId);
      state = { entryId: state.entryId, restoreSearch: input };
      if (result) mainResults.current.set(state.entryId, { inputKey: JSON.stringify(input), result: Array.isArray(result) ? { candidates: result } : result });
    }
    if (target.route === 'qna' && id?.questionId) state.questionId = id.questionId;
    if (['station', 'ride', 'guide'].includes(target.route)) {
      state.selectedStationId = target.stationId;
      state.guideContext = guideFor(source.state, target.stationId);
    }
    if (target.route === 'journey' && !state.journeyInput) {
      state.journeyInput = journeyHistoryInput({ origin: source.state.restoreSearch?.origin, requiredBikeCount: source.state.restoreSearch?.requiredBikeCount });
    }
    if (target.route === 'journey-result') {
      const decisionState = decisionStateFor(target.stationId);
      if (decisionState) state = { ...state, ...decisionState };
      else if (state.journeyDecisionId !== target.stationId) {
        delete state.guideContext;
        delete state.selectedStationId;
        state.journeyDecisionId = target.stationId;
      }
    }
    window.history.pushState(consumerHistoryState(state), '', '/' + target.hash);
    syncLocation();
  };
  const login = () => navigate('login');
  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setAuthState('anonymous');
    setSubscription({ status: 'ANONYMOUS' });
    mainResults.current.clear();
    decisions.current.clear();
    window.history.replaceState({ entryId: newConsumerEntryId() }, '');
    syncLocation();
  }, [syncLocation]);
  const handleCheckoutSuccess = useCallback((value) => setSubscription(value), []);
  const personalAdapter = useMemo(() => ({ ...consumerPersonalAdapter, logout: handleLogout }), [handleLogout]);
  const handleInputChange = useCallback((input) => {
    const current = readLocation();
    if (current.route !== 'main' || current.state.entryId !== location.state.entryId) return;
    const restoreSearch = searchHistoryInput(input);
    if (JSON.stringify(restoreSearch) === JSON.stringify(current.state.restoreSearch)) return;
    window.history.replaceState({ entryId: current.state.entryId, restoreSearch }, '');
    syncLocation();
  }, [location.state.entryId, syncLocation]);
  const handleSearchComplete = useCallback((input, result) => {
    const current = readLocation();
    if (current.route !== 'main' || current.state.entryId !== location.state.entryId) return;
    const restoreSearch = searchHistoryInput(input);
    if (result) mainResults.current.set(current.state.entryId, { inputKey: JSON.stringify(restoreSearch), result: Array.isArray(result) ? { candidates: result } : result });
    else mainResults.current.delete(current.state.entryId);
    window.history.replaceState({ entryId: current.state.entryId, restoreSearch }, '');
    syncLocation();
  }, [location.state.entryId, syncLocation]);
  const handleJourneyResult = useCallback((decision) => {
    if (!decision?.decisionId) return;
    const navigationState = decisionNavigationState(decision);
    decisions.current.set(decision.decisionId, { state: navigationState, expiresAt: decision.expiresAt });
    const current = readLocation();
    if (current.route !== 'journey' && (current.route !== 'journey-result' || current.stationId !== decision.decisionId)) return;
    const state = consumerHistoryState({ ...current.state, ...navigationState });
    if (JSON.stringify(state) === JSON.stringify(current.state)) return;
    window.history.replaceState(state, '');
    syncLocation();
  }, [syncLocation]);
  const handleJourneyInput = useCallback((input) => {
    const current = readLocation();
    if (current.route !== 'journey') return;
    window.history.replaceState(consumerHistoryState({ ...current.state, journeyInput: journeyHistoryInput(input) }), '');
    syncLocation();
  }, [syncLocation]);
  const openCandidate = (nextRoute, candidate, input) => {
    const source = readLocation();
    window.history.replaceState(consumerHistoryState({ ...source.state,
      restoreSearch: searchHistoryInput(input || source.state.restoreSearch), selectedStationId: candidate.stationId,
      guideContext: candidateGuideContext(candidate.stationId, candidate, input || source.state.restoreSearch),
    }), '');
    navigate(nextRoute, candidate.stationId);
  };
  const handleCurrentData = (execution, input) => {
    if (execution.kind === 'PLAN_RECHECK') {
      handleJourneyResult(execution.result);
      navigate('journey-result', execution.result?.decisionId);
    }
    if (execution.kind === 'SEARCH_RECHECK' && input) {
      navigate('main', { restoreSearch: input }, execution.result);
    }
  };

  if (isAdminV2Preview) return <AdminV2PreviewApp />;
  if (isAdminV2Production) return <AdminV2ProductionApp />;
  if (isLoginPath) return <LoginPage />;
  if (!introComplete && route === 'main') return <OpeningPage onComplete={() => setIntroComplete(true)} />;
  if (route !== 'main' && ['loading', 'error'].includes(authState)) {
    return <ConsumerR2Theme><ConsumerContainer as="main" id="main-content"><AsyncState state={authState === 'loading' ? 'loading' : 'error'} title={authState === 'loading' ? '로그인 상태를 확인하고 있습니다' : '로그인 상태를 확인하지 못했습니다'} onAction={refreshSession} /></ConsumerContainer></ConsumerR2Theme>;
  }
  const common = { authState, user, onNavigate: navigate, onLogin: login };
  const accessState = authState === 'authenticated' ? subscription.status : 'ANONYMOUS';
  if (protectedAi && accessState !== 'ACTIVE') {
    return <PremiumAccessGatePage {...common} accessState={accessState} onContinueFree={() => navigate('main')} onOpenCheckout={() => navigate('checkout')} onRetry={() => setSubscriptionReload((value) => value + 1)} />;
  }
  if (route === 'checkout') return <PremiumSandboxCheckoutPage {...common} accessState={accessState} onBack={() => navigate('journey')} onSuccess={handleCheckoutSuccess} />;
  if (route === 'station') return <StationDetailPage key={stationId} {...common} stationId={stationId} />;
  if (route === 'ride') return <RideExplorePage key={stationId} {...common} stationId={stationId} />;
  if (route === 'guide') return <ConsumerRidingGuidePage key={stationId} {...common} stationId={stationId} guideContext={guideFor(location.state, stationId)} />;
  if (route === 'journey') return <ConsumerJourneyPlannerPage key={location.state.entryId} {...common} initialInput={location.state.journeyInput || {}} onInputChange={handleJourneyInput} onResult={handleJourneyResult} />;
  if (route === 'journey-result') return <ConsumerJourneyPlanResultPage key={stationId} {...common} decisionId={stationId} onResult={handleJourneyResult} />;
  if (route === 'archive') return <PersonalArchivePage {...common} onReplay={(decision) => { handleJourneyResult(decision); navigate('journey-result', decision.decisionId); }} />;
  if (route === 'mypage') return <PersonalMyPage adapter={personalAdapter} onNavigate={navigate} />;
  if (route === 'qna') return <ConsumerQnaPage key={location.state.questionId || 'list'} {...common} initialQuestionId={location.state.questionId} />;
  if (route === 'alerts') return <ConsumerAlertsPage {...common} searchInput={location.state.restoreSearch} onCurrentData={handleCurrentData} />;
  return <ConsumerMainPage key={entryId} onNavigate={navigate} onLogin={login} onInputChange={handleInputChange} onSearchComplete={handleSearchComplete} restoreSearch={restoreSearch} currentResult={restoredMainResult} onOpenStation={(candidate, input) => openCandidate('station', candidate, input)} onOpenRide={(candidate, input) => openCandidate('ride', candidate, input)} />;
}

export default App;
