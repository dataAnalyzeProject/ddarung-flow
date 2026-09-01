import AdminConsoleSwitcher from '../components/AdminConsoleSwitcher';
import PermissionAwareNav from '../components/PermissionAwareNav';
import ReferenceTimeBar from '../components/ReferenceTimeBar';
import { routesForConsole } from '../routes/routeMap';
import ddaragayoLogo from '../../../assets/main/ddaragayo-logo.png';

export default function AdminV2Shell({ consoles, activeConsole, activeRoute, access, allowedRouteIds = null, onConsoleSelect, onRouteNavigate, children }) {
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
        </div>
      </div>
    </header>
    <div className="admin-v2-layout">
      <aside className="admin-v2-sidebar"><PermissionAwareNav routes={routesForConsole(activeConsole, access.permissions, allowedRouteIds)} activeRouteId={activeRoute?.id} onNavigate={onRouteNavigate} /></aside>
      <div id="admin-v2-main" tabIndex={-1} className="admin-v2-content">{children}</div>
    </div>
  </div>;
}
