import { useEffect, useState } from 'react';
import { createFixtureAdminAccessAdapter } from '../fixtures/fixtureAdminAccessAdapter';
import { defaultRoute, resolvePreviewRoute, visibleConsoles } from '../routes/routeMap';
import { routesForConsole } from '../routes/routeMap';
import AsyncStatePanel from '../components/AsyncStatePanel';
import AdminV2Shell from './AdminV2Shell';
import '../adminV2.css';

function fixtureIdFromSearch(search) { return new URLSearchParams(search).get('fixture') || 'OPS_VIEWER'; }
function stateForAccess(access) { return access.state === 'AUTH_REQUIRED' ? 'FORBIDDEN' : access.state === 'ADMIN_ACCESS_DENIED' ? 'FORBIDDEN' : 'ERROR'; }

export default function AdminV2PreviewApp({ pathname = window.location.pathname, search = window.location.search }) {
  const [access, setAccess] = useState(null);
  const [activePath, setActivePath] = useState(pathname);
  useEffect(() => { createFixtureAdminAccessAdapter({ fixtureId: fixtureIdFromSearch(search) }).load().then(setAccess); }, [search]);
  if (!access) return <AsyncStatePanel state="LOADING" />;
  if (access.state !== 'READY') return <AsyncStatePanel state={stateForAccess(access)} code={access.code} />;
  const resolution = resolvePreviewRoute(activePath, access);
  if (resolution.type === 'NOT_FOUND') return <AsyncStatePanel state="EMPTY" code="NOT_FOUND" />;
  if (resolution.type === 'FORBIDDEN') return <AsyncStatePanel state="FORBIDDEN" code="ADMIN_PERMISSION_DENIED" requiredPermission={resolution.route.requiredPermission} />;
  const route = resolution.type === 'REDIRECT' ? resolution.route : resolution.route;
  if (!route) return <AsyncStatePanel state="FORBIDDEN" code="ADMIN_PERMISSION_DENIED" />;
  const consoles = visibleConsoles(access.permissions);
  const activeConsole = route.console;
  const Page = route.Component;
  return <AdminV2Shell consoles={consoles} activeConsole={activeConsole} activeRoute={route} access={access} onConsoleSelect={(consoleId) => setActivePath(routesForConsole(consoleId, access.permissions)[0].previewPath)} onRouteNavigate={(nextRoute) => setActivePath(nextRoute.previewPath)}><Page route={route} /></AdminV2Shell>;
}
