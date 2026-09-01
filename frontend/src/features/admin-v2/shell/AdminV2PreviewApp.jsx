import { useCallback, useEffect, useRef, useState } from 'react';
import { createFixtureAdminAccessAdapter } from '../adapters/fixtureAdminAccessAdapter';
import { PRODUCTION_RELEASED_ROUTE_IDS, resolvePreviewRoute, visibleConsoles } from '../routes/routeMap';
import { routesForConsole } from '../routes/routeMap';
import AsyncStatePanel from '../components/AsyncStatePanel';
import AdminV2Shell from './AdminV2Shell';
import { createPreviewAdapterForRoute } from '../fixtures/previewPageAdapters';
import '../adminV2.css';

function fixtureIdFromSearch(search) { return new URLSearchParams(search).get('fixture') || 'OPS_VIEWER'; }
function stateForAccess(access) { return access.state === 'AUTH_REQUIRED' || access.state === 'ADMIN_ACCESS_DENIED' ? 'FORBIDDEN' : 'ERROR'; }
function accessFailure() { return { state: 'ACCESS_ERROR', code: 'ADMIN_ACCESS_UNAVAILABLE', adminRoles: [], permissions: [], defaultConsole: null, generatedAt: null, source: 'FIXTURE' }; }
function browserLocation() { return { pathname: window.location.pathname, search: window.location.search }; }

export default function AdminV2PreviewApp({ pathname, search, createAccessAdapter = createFixtureAdminAccessAdapter }) {
  const initial = browserLocation();
  const suppliedPathname = pathname ?? initial.pathname;
  const suppliedSearch = search ?? initial.search;
  const [access, setAccess] = useState(null);
  const [location, setLocation] = useState({ pathname: suppliedPathname, search: suppliedSearch });
  const generation = useRef(0);
  const previousProps = useRef({ pathname: suppliedPathname, search: suppliedSearch });
  const [loadedFixtureId, setLoadedFixtureId] = useState(null);
  const [loadedAdapter, setLoadedAdapter] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const fixtureId = fixtureIdFromSearch(location.search);
  const requestedFixtureId = fixtureIdFromSearch(suppliedSearch);

  useEffect(() => {
    if (previousProps.current.pathname === suppliedPathname && previousProps.current.search === suppliedSearch) return;
    previousProps.current = { pathname: suppliedPathname, search: suppliedSearch };
    setLocation({ pathname: suppliedPathname, search: suppliedSearch });
  }, [suppliedPathname, suppliedSearch]);
  useEffect(() => {
    const onPopState = () => setLocation(browserLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setAccess(null);
    setLoadedFixtureId(null);
    Promise.resolve()
      .then(() => createAccessAdapter({ fixtureId }).load({ signal: controller.signal }))
      .then((nextAccess) => { if (generation.current === current && !controller.signal.aborted) { setAccess(nextAccess); setLoadedFixtureId(fixtureId); setLoadedAdapter(() => createAccessAdapter); } })
      .catch(() => { if (generation.current === current && !controller.signal.aborted) { setAccess(accessFailure()); setLoadedFixtureId(fixtureId); setLoadedAdapter(() => createAccessAdapter); } });
    return () => controller.abort();
  }, [createAccessAdapter, fixtureId, retryVersion]);

  const navigate = useCallback((nextPath, replace = false) => {
    const nextUrl = `${nextPath}${location.search}`;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    setLocation({ pathname: nextPath, search: location.search });
  }, [location.search]);

  useEffect(() => {
    if (!access || loadedFixtureId !== fixtureId || loadedAdapter !== createAccessAdapter || access.state !== 'READY') return;
    const resolution = resolvePreviewRoute(location.pathname, access);
    if (resolution.type === 'REDIRECT' && resolution.route) navigate(resolution.route.previewPath, true);
  }, [access, createAccessAdapter, fixtureId, loadedAdapter, loadedFixtureId, location.pathname, navigate]);

  if (!access || loadedFixtureId !== fixtureId || requestedFixtureId !== fixtureId || loadedAdapter !== createAccessAdapter) return <AsyncStatePanel state="LOADING" />;
  if (access.state !== 'READY') return <AsyncStatePanel state={stateForAccess(access)} code={access.code} onRetry={() => setRetryVersion((version) => version + 1)} />;
  const resolution = resolvePreviewRoute(location.pathname, access);
  if (resolution.type === 'REDIRECT') return resolution.route ? <AsyncStatePanel state="LOADING" /> : <AsyncStatePanel state="FORBIDDEN" code="ADMIN_PERMISSION_DENIED" />;
  if (resolution.type === 'NOT_FOUND') return <AsyncStatePanel state="EMPTY" code="NOT_FOUND" />;
  if (resolution.type === 'FORBIDDEN') return <AsyncStatePanel state="FORBIDDEN" code="ADMIN_PERMISSION_DENIED" requiredPermission={resolution.route.requiredPermission} />;
  const route = resolution.route;
  if (!PRODUCTION_RELEASED_ROUTE_IDS.includes(route.id)) return <AsyncStatePanel state="EMPTY" code="ROUTE_NOT_IN_REDESIGN_SCOPE" />;
  const consoles = visibleConsoles(access.permissions, PRODUCTION_RELEASED_ROUTE_IDS);
  const Page = route.Component;
  const createAdapter = createPreviewAdapterForRoute(route.id);
  return <AdminV2Shell consoles={consoles} activeConsole={route.console} activeRoute={route} access={access} allowedRouteIds={PRODUCTION_RELEASED_ROUTE_IDS} onConsoleSelect={(consoleId) => navigate(routesForConsole(consoleId, access.permissions, PRODUCTION_RELEASED_ROUTE_IDS)[0].previewPath)} onRouteNavigate={(nextRoute) => navigate(nextRoute.previewPath)}><Page route={route} {...(createAdapter ? { createAdapter } : {})} /></AdminV2Shell>;
}
