import AdminConsoleSwitcher from '../components/AdminConsoleSwitcher';
import PermissionAwareNav from '../components/PermissionAwareNav';
import ReferenceTimeBar from '../components/ReferenceTimeBar';
import { routesForConsole } from '../routes/routeMap';
import ddaragayoLogo from '../../../assets/main/ddaragayo-logo.png';
import { useState } from 'react';
import { logout } from '../../login/authApi';
import { clearAdminReturnTarget } from '../auth/adminSession.js';

function browserLoginRedirect(path) { window.location.replace(path); }

export default function AdminV2Shell({ consoles, activeConsole, activeRoute, access, allowedRouteIds = null, onConsoleSelect, onRouteNavigate, children, showLogout = false, logoutAction = logout, navigateToLogin = browserLoginRedirect }) {
  const [logoutState, setLogoutState] = useState('idle');
  const handleLogout = async () => {
    if (logoutState === 'pending') return;
    setLogoutState('pending');
    try {
      await logoutAction();
      clearAdminReturnTarget();
      navigateToLogin('/login?logout=success');
    } catch {
      setLogoutState('failed');
    }
  };
  return <div className="admin-v2-shell">
    <a className="admin-v2-skip-link" href="#admin-v2-main">본문으로 건너뛰기</a>
    <header className="admin-v2-header">
      <div className="admin-v2-brand">
        <img src={ddaragayoLogo} width="174" height="43" alt="따라가요" />
        <span className="admin-v2-brand-context">운영 콘솔</span>
      </div>
      <div className="admin-v2-header-context">
        <AdminConsoleSwitcher consoles={consoles} activeConsole={activeConsole} onSelect={onConsoleSelect} />
        <ReferenceTimeBar generatedAt={access.generatedAt} source={access.source} />
        <div className="admin-v2-account-context" aria-label="현재 관리자 권한">
          <span>현재 권한</span><strong>{access.adminRoles?.join(', ') || '알 수 없음'}</strong>
          {showLogout && <button type="button" className="admin-v2-logout" onClick={handleLogout} disabled={logoutState === 'pending'}>{logoutState === 'pending' ? '로그아웃 중' : '로그아웃'}</button>}
        </div>
      </div>
    </header>
    {logoutState === 'failed' && <p className="admin-v2-logout-error" role="alert">로그아웃에 실패했습니다. 다시 시도해 주세요.</p>}
    <div className="admin-v2-layout">
      <aside className="admin-v2-sidebar"><PermissionAwareNav routes={routesForConsole(activeConsole, access.permissions, allowedRouteIds)} activeRouteId={activeRoute?.id} onNavigate={onRouteNavigate} /></aside>
      <div id="admin-v2-main" tabIndex={-1} className="admin-v2-content">{children}</div>
    </div>
  </div>;
}
