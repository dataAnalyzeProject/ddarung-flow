import CapabilityNotice from './CapabilityNotice';

export default function RoutePlaceholder({ route }) {
  return <main className="admin-v2-placeholder"><p>{route.id}</p><h1>{route.title}</h1><p>필요 권한: {route.requiredPermission}</p><CapabilityNotice /></main>;
}

export function createRoutePlaceholder() {
  return function Placeholder({ route }) { return <RoutePlaceholder route={route} />; };
}
