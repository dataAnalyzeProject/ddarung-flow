import { useCallback, useEffect, useRef, useState } from 'react';
import { createLiveAdminAccessAdapter } from '../adapters/liveAdminAccessAdapter';
import { defaultRoute, PRODUCTION_RELEASED_ROUTE_IDS, resolveCanonicalRoute, routesForConsole, visibleConsoles } from '../routes/routeMap';
import AsyncStatePanel from '../components/AsyncStatePanel';
import AdminV2Shell from './AdminV2Shell';
import '../adminV2.css';

function accessFailure() {
  return { state: 'ACCESS_ERROR', code: 'ADMIN_ACCESS_UNAVAILABLE', adminRoles: [], permissions: [], defaultConsole: null, generatedAt: null, source: 'LIVE' };
}

function stateForAccess(access) {
  return access.state === 'AUTH_REQUIRED' || access.state === 'ADMIN_ACCESS_DENIED' ? 'FORBIDDEN' : 'ERROR';
}

function browserLocation() {
  return { pathname: window.location.pathname, search: window.location.search };
}

export default function AdminV2ProductionApp({ pathname, search, createAccessAdapter = createLiveAdminAccessAdapter }) {
  const initial = browserLocation();
  const suppliedPathname = pathname ?? initial.pathname;
  const suppliedSearch = search ?? initial.search;
  const [location, setLocation] = useState({ pathname: suppliedPathname, search: suppliedSearch });
  const [access, setAccess] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const generation = useRef(0);
  const previousProps = useRef({ pathname: suppliedPathname, search: suppliedSearch });

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
    Promise.resolve()
      .then(() => createAccessAdapter().load({ signal: controller.signal }))
      .then((nextAccess) => {
        if (generation.current === current && !controller.signal.aborted) setAccess(nextAccess);
      })
      .catch((error) => {
        if (generation.current === current && !controller.signal.aborted && error?.name !== 'AbortError') setAccess(accessFailure());
      });
    return () => controller.abort();
  }, [createAccessAdapter, retryVersion]);

  const navigate = useCallback((nextPath, replace = false) => {
    const nextUrl = `${nextPath}${location.search}`;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    setLocation({ pathname: nextPath, search: location.search });
  }, [location.search]);

  useEffect(() => {
    if (access?.state !== 'READY' || location.pathname !== '/admin') return;
    const route = defaultRoute(access, PRODUCTION_RELEASED_ROUTE_IDS);
    if (route) navigate(route.canonicalPath, true);
  }, [access, location.pathname, navigate]);

  if (!access) return <AsyncStatePanel state="LOADING" />;
  if (access.state !== 'READY') return <AsyncStatePanel state={stateForAccess(access)} code={access.code} onRetry={() => setRetryVersion((version) => version + 1)} />;

  if (location.pathname === '/admin') {
    return <AsyncStatePanel state={defaultRoute(access, PRODUCTION_RELEASED_ROUTE_IDS) ? 'LOADING' : 'EMPTY'} code="RELEASE_NOT_AVAILABLE" />;
  }

  const resolution = resolveCanonicalRoute(location.pathname, access);
  if (resolution.type === 'NOT_FOUND') return <AsyncStatePanel state="EMPTY" code="NOT_FOUND" />;
  if (resolution.type === 'RELEASE_NOT_AVAILABLE') return <AsyncStatePanel state="EMPTY" code="RELEASE_NOT_AVAILABLE" />;
  if (resolution.type === 'FORBIDDEN') return <AsyncStatePanel state="FORBIDDEN" code="ADMIN_PERMISSION_DENIED" requiredPermission={resolution.route.requiredPermission} />;

  const route = resolution.route;
  const consoles = visibleConsoles(access.permissions, PRODUCTION_RELEASED_ROUTE_IDS);
  const Page = route.Component;
  return <AdminV2Shell
    consoles={consoles}
    activeConsole={route.console}
    activeRoute={route}
    access={access}
    allowedRouteIds={PRODUCTION_RELEASED_ROUTE_IDS}
    onConsoleSelect={(consoleId) => navigate(routesForConsole(consoleId, access.permissions, PRODUCTION_RELEASED_ROUTE_IDS)[0].canonicalPath)}
    onRouteNavigate={(nextRoute) => navigate(nextRoute.canonicalPath)}
  ><Page route={route} /></AdminV2Shell>;
}
