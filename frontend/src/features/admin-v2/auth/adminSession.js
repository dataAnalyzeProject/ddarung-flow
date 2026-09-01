const ADMIN_RETURN_TARGET_KEY = 'ddarung.admin.return-target.v1';
const ADMIN_AUTH_REQUIRED_EVENT = 'ddarung:admin-auth-required';

export function normalizeAdminReturnTarget(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return null;
    if (target.pathname !== '/admin' && !target.pathname.startsWith('/admin/')) return null;
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

export function currentAdminReturnTarget() {
  return normalizeAdminReturnTarget(`${window.location.pathname}${window.location.search}`);
}

export function storeAdminReturnTarget(value = currentAdminReturnTarget()) {
  const target = normalizeAdminReturnTarget(value);
  if (target) window.sessionStorage.setItem(ADMIN_RETURN_TARGET_KEY, target);
  return target;
}

export function consumeAdminReturnTarget() {
  const target = normalizeAdminReturnTarget(window.sessionStorage.getItem(ADMIN_RETURN_TARGET_KEY));
  window.sessionStorage.removeItem(ADMIN_RETURN_TARGET_KEY);
  return target;
}

export function clearAdminReturnTarget() {
  window.sessionStorage.removeItem(ADMIN_RETURN_TARGET_KEY);
}

export function publishAdminAuthRequired() {
  window.dispatchEvent(new Event(ADMIN_AUTH_REQUIRED_EVENT));
}

export function subscribeAdminAuthRequired(listener) {
  window.addEventListener(ADMIN_AUTH_REQUIRED_EVENT, listener);
  return () => window.removeEventListener(ADMIN_AUTH_REQUIRED_EVENT, listener);
}

export async function adminFetch(input, init) {
  const response = await fetch(input, init);
  const url = typeof input === 'string' ? input : input?.url;
  if (response.status === 401 && typeof url === 'string' && new URL(url, window.location.origin).pathname.startsWith('/api/v1/admin/')) {
    publishAdminAuthRequired();
  }
  return response;
}
