import { adminFetch } from '../auth/adminSession.js';

function accessFailure(state = 'ACCESS_ERROR', code = 'ADMIN_ACCESS_UNAVAILABLE') {
  return {
    state,
    code,
    role: null,
    accountRole: null,
    adminRoles: [],
    permissions: [],
    defaultConsole: null,
    generatedAt: null,
    source: 'LIVE',
  };
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function readyAccess(payload) {
  if (!payload || !Array.isArray(payload.adminRoles) || !Array.isArray(payload.permissions)) {
    return accessFailure();
  }
  return {
    state: 'READY',
    role: payload.role,
    accountRole: payload.accountRole,
    adminRoles: payload.adminRoles,
    permissions: payload.permissions,
    defaultConsole: payload.defaultConsole ?? null,
    generatedAt: payload.generatedAt ?? null,
    source: 'LIVE',
  };
}

export function createLiveAdminAccessAdapter() {
  const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
  return {
    async load({ signal } = {}) {
      try {
        const response = await adminFetch(`${baseUrl}/api/v1/admin/access`, {
          method: 'GET',
          credentials: 'include',
          signal,
        });
        if (response.status === 401) return accessFailure('AUTH_REQUIRED', 'AUTH_REQUIRED');
        if (response.status === 403) return accessFailure('ADMIN_ACCESS_DENIED', 'ADMIN_ACCESS_DENIED');
        if (!response.ok) return accessFailure();
        try {
          return readyAccess(await response.json());
        } catch (error) {
          if (isAbortError(error)) throw error;
          return accessFailure();
        }
      } catch (error) {
        if (isAbortError(error)) throw error;
        return accessFailure();
      }
    },
  };
}
