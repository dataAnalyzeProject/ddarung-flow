import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class OpsApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '운영 데이터를 불러오지 못했습니다.');
    this.name = 'OpsApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_ACCESS_DENIED' : 'OPS_API_ERROR');
  }
}

async function request(path, signal) {
  const response = await adminFetch(`${API_BASE_URL}${path}`, { credentials: 'include', signal });
  if (response.ok) return response.json();
  let body = {};
  try { body = await response.json(); } catch (_) { /* response body is optional */ }
  throw new OpsApiError({ status: response.status, code: body.code, message: body.message });
}

function queryString({ horizonMinutes, requiredBikeCount, limit, snapshotId }) {
  const query = new URLSearchParams({ horizonMinutes: String(horizonMinutes), requiredBikeCount: String(requiredBikeCount) });
  if (limit) query.set('limit', String(limit));
  if (snapshotId) query.set('snapshotId', snapshotId);
  return query.toString();
}

export function createLiveOpsDashboardAdapter() {
  return {
    async load({ horizonMinutes, requiredBikeCount, signal }) {
      const overview = await request(`/api/v1/admin/ops/overview?${queryString({ horizonMinutes, requiredBikeCount })}`, signal);
      const risk = overview.priorityStations?.length ? {
        referenceTime: overview.referenceTime,
        dataState: overview.dataState,
        items: overview.priorityStations,
        scope: overview.scope,
      } : null;
      return { overview, risk, riskError: null };
    },
  };
}
