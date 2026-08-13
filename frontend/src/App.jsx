import { useEffect, useState } from 'react';
import MainPage from './features/main/MainPage';
import QnaPage from './features/qna/QnaPage';
import LoginPage from './features/login/LoginPage';
import IntroPage from './features/intro/IntroPage';
import { hasSeenIntro } from './features/intro/introStorage';

function App() {
  const isLoginPath = window.location.pathname === '/login';
  const [route, setRoute] = useState(() => window.location.hash === '#qna' ? 'qna' : 'main');
  const [introComplete, setIntroComplete] = useState(
    () => isLoginPath || hasSeenIntro()
  );

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash === '#qna' ? 'qna' : 'main');
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  const navigate = (nextRoute) => {
    const nextHash = nextRoute === 'qna' ? '#qna' : '';
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    setRoute(nextRoute);
  };

  if (isLoginPath) {
    return <LoginPage />;
  }

  if (!introComplete) {
    return <IntroPage onComplete={() => setIntroComplete(true)} />;
  }

  if (route === 'qna') {
    return <QnaPage onNavigate={navigate} />;
  }

  return <MainPage onNavigate={navigate} />;
}

export default App;
