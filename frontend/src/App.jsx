import MainPage from './features/main/MainPage';
import LoginPage from './features/login/LoginPage';

function App() {
  if (window.location.pathname === '/login') {
    return <LoginPage />;
  }

  return <MainPage />;
}

export default App;
