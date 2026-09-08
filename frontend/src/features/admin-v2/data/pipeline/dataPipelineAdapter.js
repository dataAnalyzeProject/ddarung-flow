import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class DataPipelineApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '파이프라인 상태를 불러오지 못했습니다.');
    this.name = 'DataPipelineApiError'; this.status = status; this.code = code || 'DATA_PIPELINE_STATUS_ERROR';
  }
}

export function createDataPipelineAdapter() {
  return { async load({ signal } = {}) {
    let response;
    try { response = await adminFetch(`${API_BASE_URL}/api/v1/admin/data/pipeline-status`, { credentials: 'include', signal }); }
    catch (error) { if (error?.name === 'AbortError') throw error; throw new DataPipelineApiError({ message: error?.message }); }
    if (response.ok) return response.json();
    let body = {}; try { body = await response.json(); } catch (_) { /* optional */ }
    throw new DataPipelineApiError({ status: response.status, code: body.code, message: body.message });
  } };
}
