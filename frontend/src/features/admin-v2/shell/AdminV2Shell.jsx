import AdminConsoleSwitcher from '../components/AdminConsoleSwitcher';
import PermissionAwareNav from '../components/PermissionAwareNav';
import ReferenceTimeBar from '../components/ReferenceTimeBar';
import { routesForConsole } from '../routes/routeMap';

export default function AdminV2Shell({ consoles, activeConsole, activeRoute, access, onConsoleSelect, onRouteNavigate, children }) {
  return <div className="admin-v2-shell">
    <header className="admin-v2-header">
      <p className="admin-v2-product-name">따릉이 관리자</p>
      <div className="admin-v2-header-context">
        <AdminConsoleSwitcher consoles={consoles} activeConsole={activeConsole} onSelect={onConsoleSelect} />
        <ReferenceTimeBar generatedAt={access.generatedAt} source={access.source} />
      </div>
    </header>
    <div className="admin-v2-layout">
      <aside className="admin-v2-sidebar"><PermissionAwareNav routes={routesForConsole(activeConsole, access.permissions)} activeRouteId={activeRoute?.id} onNavigate={onRouteNavigate} /></aside>
      <main className="admin-v2-content">{children}</main>
    </div>
  </div>;
}
