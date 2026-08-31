const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class AnalysisApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '반복 품절 패턴을 불러오지 못했습니다.');
    this.name = 'AnalysisApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'OPS_ANALYSIS_ERROR');
  }
}

export function createLiveAnalysisAdapter() {
  return {
    async load({ view, signal }) {
      const query = new URLSearchParams({ view, riskType: 'RENTAL' });
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/ops/analysis?${query}`, { credentials: 'include', signal });
      if (response.ok) return response.json();
      let body = {};
      try { body = await response.json(); } catch (_) { /* response body is optional */ }
      throw new AnalysisApiError({ status: response.status, code: body.code, message: body.message });
    },
  };
}
