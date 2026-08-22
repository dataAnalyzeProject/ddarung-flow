import { useEffect, useState } from 'react';
import MainPage from './features/main/MainPage';
import QnaPage from './features/qna/QnaPage';
import ArchivePage from './features/archive/ArchivePage';
import AlertsPage from './features/alerts/AlertsPage';
import MyPage from './features/mypage/MyPage';
import LoginPage from './features/login/LoginPage';
import IntroPage from './features/intro/IntroPage';
import AdminAccessGate from './features/admin/AdminAccessGate';
import { hasSeenIntro } from './features/intro/introStorage';

const HASH_ROUTES = ['qna', 'archive', 'alerts', 'mypage'];

function routeFromHash() {
  const hash = window.location.hash.slice(1);
  return HASH_ROUTES.includes(hash) ? hash : 'main';
}

function App() {
  const isLoginPath = window.location.pathname === '/login';
  const [route, setRoute] = useState(routeFromHash);
  const [introComplete, setIntroComplete] = useState(
    () => isLoginPath || hasSeenIntro()
  );

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

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

  if (window.location.pathname === '/admin') {
    return <AdminAccessGate />;
  }

  if (!introComplete) {
    return <IntroPage onComplete={() => setIntroComplete(true)} />;
  }

  if (route === 'qna') {
    return <QnaPage onNavigate={navigate} />;
  }

  if (route === 'archive') {
    return <ArchivePage onNavigate={navigate} />;
  }

  if (route === 'alerts') {
    return <AlertsPage onNavigate={navigate} />;
  }

  if (route === 'mypage') {
    return <MyPage onNavigate={navigate} />;
  }

  return <MainPage onNavigate={navigate} />;
}

export default App;
