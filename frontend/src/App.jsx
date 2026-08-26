import { useEffect, useState } from 'react';
import MainPage from './features/main/MainPage';
import QnaPage from './features/qna/QnaPage';
import ArchivePage from './features/archive/ArchivePage';
import AlertsPage from './features/alerts/AlertsPage';
import MyPage from './features/mypage/MyPage';
import LoginPage from './features/login/LoginPage';
import IntroPage from './features/intro/IntroPage';
import AdminAccessGate from './features/admin/AdminAccessGate';
import AdminApp from './features/admin/AdminApp';
import { hasSeenIntro } from './features/intro/introStorage';
import { getCurrentUser, logout } from './features/login/authApi';

const HASH_ROUTES = ['qna', 'archive', 'alerts', 'mypage'];

function routeFromHash() {
  const hash = window.location.hash.slice(1);
  return HASH_ROUTES.includes(hash) ? hash : 'main';
}

function App() {
  const isLoginPath = window.location.pathname === '/login';
  const isAdminPreviewPath = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('adminPreview');
  const [route, setRoute] = useState(routeFromHash);
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
    if (isAdminPreviewPath) return undefined;
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
  }, [isAdminPreviewPath]);

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

  const navigate = (nextRoute) => {
    if (nextRoute === 'admin') {
      window.location.assign('/admin');
      return;
    }
    const nextHash = HASH_ROUTES.includes(nextRoute) ? `#${nextRoute}` : '';
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    setRoute(nextRoute);
  };

  if (isLoginPath) {
    return <LoginPage />;
  }

  if (isAdminPreviewPath) {
    return <AdminApp />;
  }

  if (window.location.pathname === '/admin') {
    return <AdminAccessGate />;
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

  return <MainPage onNavigate={navigate} />;
}

export default App;
