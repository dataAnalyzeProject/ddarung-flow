export default function PermissionAwareNav({ routes, activeRouteId, onNavigate }) {
  return <nav aria-label="관리자 메뉴"><ul className="admin-v2-nav">
    {routes.map((route) => <li key={route.id}><button type="button" aria-current={route.id === activeRouteId ? 'page' : undefined} onClick={() => onNavigate(route)}>{route.title}</button></li>)}
  </ul></nav>;
}
