const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class CandidatesApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '집중관리 목록을 불러오지 못했습니다.');
    this.name = 'CandidatesApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'OPS_API_ERROR');
  }
}

function queryString({ horizonMinutes, requiredBikeCount, limit, cursor }) {
  const query = new URLSearchParams({
    horizonMinutes: String(horizonMinutes),
    requiredBikeCount: String(requiredBikeCount),
    riskType: 'RENTAL',
    limit: String(limit),
  });
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

export function createLiveCandidatesAdapter() {
  return {
    async load({ horizonMinutes, requiredBikeCount, limit, cursor, signal }) {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/ops/candidates?${queryString({ horizonMinutes, requiredBikeCount, limit, cursor })}`, { credentials: 'include', signal });
      if (response.ok) return response.json();
      let body = {};
      try { body = await response.json(); } catch (_) { /* response body is optional */ }
      throw new CandidatesApiError({ status: response.status, code: body.code, message: body.message });
    },
  };
}
