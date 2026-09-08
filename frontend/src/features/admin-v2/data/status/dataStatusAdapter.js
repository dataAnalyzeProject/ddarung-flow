import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class DataStatusApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '데이터 상태를 불러오지 못했습니다.');
    this.name = 'DataStatusApiError'; this.status = status; this.code = code || 'DATA_STATUS_ERROR';
  }
}

async function request(path, options = {}) {
  const { body, ...init } = options;
  let response;
  try {
    response = await adminFetch(`${API_BASE_URL}${path}`, {
      credentials: 'include', ...init,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new DataStatusApiError({ status: error?.status, code: error?.code, message: error?.message });
  }
  if (response.ok) return response;
  let errorBody = {}; try { errorBody = await response.json(); } catch (_) { /* optional */ }
  throw new DataStatusApiError({ status: response.status, code: errorBody.code, message: errorBody.message });
}

export function createDataStatusAdapter() {
  return {
    async load({ signal } = {}) {
      const [statusResponse, accessResponse] = await Promise.all([
        request('/api/v1/admin/data/status', { signal }),
        request('/api/v1/admin/access', { signal }),
      ]);
      const [status, access] = await Promise.all([statusResponse.json(), accessResponse.json()]);
      return { ...status, permissions: access.permissions || [] };
    },
    async listExports({ signal } = {}) { return (await request('/api/v1/admin/exports', { signal })).json(); },
    async createExport(payload, { signal } = {}) {
      const csrf = await (await request('/api/v1/auth/csrf', { signal })).json();
      if (!csrf?.headerName || !csrf?.token) throw new DataStatusApiError({ code: 'CSRF_TOKEN_UNAVAILABLE' });
      return (await request('/api/v1/admin/exports', { method: 'POST', signal, headers: { [csrf.headerName]: csrf.token }, body: payload })).json();
    },
    async downloadExport(exportId, { signal } = {}) {
      const response = await request(`/api/v1/admin/exports/${exportId}/download`, { signal });
      return { blob: await response.blob(), disposition: response.headers.get('Content-Disposition') };
    },
  };
}
