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
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', signal });
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

function snapshotKey(horizonMinutes, requiredBikeCount) { return `adminOpsRiskSnapshot:${horizonMinutes}:${requiredBikeCount}`; }

export function createLiveOpsDashboardAdapter() {
  return {
    async load({ horizonMinutes, requiredBikeCount, signal }) {
      const key = snapshotKey(horizonMinutes, requiredBikeCount);
      const snapshotId = window.sessionStorage.getItem(key);
      if (!snapshotId) {
        const overview = await request(`/api/v1/admin/ops/overview?${queryString({ horizonMinutes, requiredBikeCount })}`, signal);
        return { overview, risk: null, riskError: null };
      }
      try {
        const overview = await request(`/api/v1/admin/ops/overview?${queryString({ horizonMinutes, requiredBikeCount, snapshotId })}`, signal);
        try {
          const risk = await request(`/api/v1/admin/ops/risk-stations?${queryString({ horizonMinutes, requiredBikeCount, limit: 5, snapshotId })}`, signal);
          return { overview, risk, riskError: null };
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          if (error.code !== 'RISK_SNAPSHOT_EXPIRED') return { overview, risk: null, riskError: error };
          throw error;
        }
      } catch (error) {
        if (error.code !== 'RISK_SNAPSHOT_EXPIRED') throw error;
        window.sessionStorage.removeItem(key);
        const overview = await request(`/api/v1/admin/ops/overview?${queryString({ horizonMinutes, requiredBikeCount })}`, signal);
        return { overview, risk: null, riskError: null };
      }
    },
  };
}
