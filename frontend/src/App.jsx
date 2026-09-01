import { useEffect, useState } from 'react';
import MainPage from './features/main/MainPage';
import QnaPage from './features/qna/QnaPage';
import ArchivePage from './features/archive/ArchivePage';
import AlertsPage from './features/alerts/AlertsPage';
import MyPage from './features/mypage/MyPage';
import LoginPage from './features/login/LoginPage';
import IntroPage from './features/intro/IntroPage';
import AdminV2PreviewApp from './features/admin-v2/shell/AdminV2PreviewApp';
import AdminV2ProductionApp from './features/admin-v2/shell/AdminV2ProductionApp';
import { isAdminV2PreviewPath, isAdminV2ProductionPath } from './features/admin-v2/routes/routeMap';
import StationDetailPage from './features/station-detail/StationDetailPage';
import JourneyPlannerPage from './features/journey/JourneyPlannerPage';
import JourneyResultPage from './features/journey/JourneyResultPage';
import { isJourneyEnabled } from './features/journey/journeyFeatureFlag';
import { hasSeenIntro } from './features/intro/introStorage';
import { getCurrentUser, logout } from './features/login/authApi';

const HASH_ROUTES = ['qna', 'archive', 'alerts', 'mypage'];

function routeFromHash() {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('station/') && hash.slice('station/'.length)) return { route: 'station', stationId: hash.slice('station/'.length) };
  if (isJourneyEnabled() && hash.startsWith('journey/result/') && hash.slice('journey/result/'.length)) return { route: 'journey-result', stationId: hash.slice('journey/result/'.length) };
  if (isJourneyEnabled() && hash === 'journey') return { route: 'journey', stationId: null };
  return { route: HASH_ROUTES.includes(hash) ? hash : 'main', stationId: null };
}

export function navigationTarget(nextRoute, nextStationId) {
  if (nextRoute === 'station' && nextStationId) return { hash: `#station/${encodeURIComponent(nextStationId)}`, route: 'station', stationId: nextStationId };
  if (isJourneyEnabled() && nextRoute === 'journey-result' && nextStationId) return { hash: `#journey/result/${encodeURIComponent(nextStationId)}`, route: 'journey-result', stationId: nextStationId };
  if (isJourneyEnabled() && nextRoute === 'journey') return { hash: '#journey', route: 'journey', stationId: null };
  if (HASH_ROUTES.includes(nextRoute)) return { hash: `#${nextRoute}`, route: nextRoute, stationId: null };
  return { hash: '', route: 'main', stationId: null };
}

function App() {
  const isLoginPath = window.location.pathname === '/login';
  const isAdminV2Preview = isAdminV2PreviewPath(window.location.pathname);
  const isAdminV2Production = isAdminV2ProductionPath(window.location.pathname);
  const skipSessionCheck = isAdminV2Preview || isAdminV2Production;
  const [{ route, stationId }, setRoute] = useState(routeFromHash);
  const [authState, setAuthState] = useState('loading');
  const [user, setUser] = useState(null);
  const [introComplete, setIntroComplete] = useState(
    () => isLoginPath || hasSeenIntro()
  );

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    if (skipSessionCheck) return undefined;
    let cancelled = false;

    getCurrentUser()
      .then((auth) => {
        if (cancelled) return;
        setUser(auth.authenticated ? auth.user : null);
        setAuthState(auth.authenticated ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (!cancelled) setAuthState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [skipSessionCheck]);

  const handleLogout = async () => {
    setAuthState('logging-out');
    try {
      await logout();
      setUser(null);
      setAuthState('anonymous');
    } catch {
      setAuthState('authenticated');
    }
  };

  const navigate = (nextRoute, nextStationId) => {
    if (nextRoute === 'admin') {
      window.location.assign('/admin');
      return;
    }
    const target = navigationTarget(nextRoute, nextStationId);
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${target.hash}`);
    setRoute({ route: target.route, stationId: target.stationId });
  };

  if (isLoginPath) {
    return <LoginPage />;
  }

  if (isAdminV2Preview) {
    return <AdminV2PreviewApp />;
  }

  if (isAdminV2Production) {
    return <AdminV2ProductionApp />;
  }

  if (!introComplete) {
    return <IntroPage onComplete={() => setIntroComplete(true)} />;
  }

  if (route === 'qna') {
    return <QnaPage authState={authState} user={user} onNavigate={navigate} onLogout={handleLogout} />;
  }

  if (route === 'archive') {
    return <ArchivePage authState={authState} user={user} onNavigate={navigate} onLogout={handleLogout} />;
  }

  if (route === 'alerts') {
    return <AlertsPage authState={authState} user={user} onNavigate={navigate} onLogout={handleLogout} />;
  }

  if (route === 'mypage') {
    return <MyPage onNavigate={navigate} />;
  }

  if (route === 'station') {
    return <StationDetailPage stationId={stationId} authState={authState} user={user} onNavigate={navigate} onLogout={handleLogout} />;
  }
  if (route === 'journey' && isJourneyEnabled()) return <JourneyPlannerPage authState={authState} onNavigate={navigate} />;
  if (route === 'journey-result' && isJourneyEnabled()) return <JourneyResultPage decisionId={stationId} onNavigate={navigate} />;

  return <MainPage onNavigate={navigate} />;
}

export default App;
