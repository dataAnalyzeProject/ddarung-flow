import { useState } from 'react';
import MainPage from './features/main/MainPage';
import LoginPage from './features/login/LoginPage';
import IntroPage from './features/intro/IntroPage';
import { hasSeenIntro } from './features/intro/introStorage';

function App() {
  const isLoginPath = window.location.pathname === '/login';
  const [introComplete, setIntroComplete] = useState(
    () => isLoginPath || hasSeenIntro()
  );

  if (isLoginPath) {
    return <LoginPage />;
  }

  if (!introComplete) {
    return <IntroPage onComplete={() => setIntroComplete(true)} />;
  }

  return <MainPage />;
}

export default App;
