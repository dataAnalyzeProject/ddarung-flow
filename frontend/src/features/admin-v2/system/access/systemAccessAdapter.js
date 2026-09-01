import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class SystemAccessApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '관리자 역할 정보를 불러오지 못했습니다.');
    this.name = 'SystemAccessApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : null);
  }
}

async function request(path, options = {}) {
  const response = await adminFetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...options });
  if (response.ok) return response.status === 204 ? null : response.json();
  let body = {};
  try { body = await response.json(); } catch (_) { /* error bodies are optional */ }
  throw new SystemAccessApiError({ status: response.status, code: body.code, message: body.message });
}

function userQuery({ page, size, sort, q }) {
  const query = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (q) query.set('q', q);
  return query.toString();
}

export function createLiveSystemAccessAdapter() {
  return {
    loadPage({ page, size, sort, q, signal }) {
      return Promise.all([
        request('/api/v1/admin/access', { signal }),
        request('/api/v1/admin/roles', { signal }),
        request(`/api/v1/admin/users?${userQuery({ page, size, sort, q })}`, { signal }),
      ]).then(([access, roles, users]) => ({ access, roles, users }));
    },
    loadUser(publicUserId, { signal } = {}) { return request(`/api/v1/admin/users/${publicUserId}/roles`, { signal }); },
    async replaceRoles(publicUserId, body, { signal } = {}) {
      const csrf = await request('/api/v1/auth/csrf', { signal });
      return request(`/api/v1/admin/users/${publicUserId}/roles`, {
        method: 'PUT',
        signal,
        headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
        body: JSON.stringify(body),
      });
    },
  };
}
