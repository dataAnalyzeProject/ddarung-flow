export class OperationsDataStatusApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '운영 데이터 상태를 불러오지 못했습니다.');
    this.name = 'OperationsDataStatusApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'OPS_DATA_STATUS_ERROR');
  }
}

export function createOperationsDataStatusAdapter() {
  return {
    async load({ signal }) {
      try {
        const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/ops/data-status`, { credentials: 'include', signal });
        if (response.ok) return response.json();
        let body = {};
        try { body = await response.json(); } catch (_) { /* response body is optional */ }
        throw new OperationsDataStatusApiError({ status: response.status, code: body.code, message: body.message });
      } catch (error) {
        if (error?.name === 'AbortError' || error instanceof OperationsDataStatusApiError) throw error;
        throw new OperationsDataStatusApiError({ status: error?.status, code: error?.code, message: error?.message });
      }
    },
  };
}
