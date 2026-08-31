const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export const REGISTRY_STATES = ['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'RETIRED'];

export class ModelOverviewApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '모델 레지스트리 정보를 불러오지 못했습니다.');
    this.name = 'ModelOverviewApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'MODEL_REGISTRY_API_ERROR');
  }
}

export function deriveRegistryStateCounts(models) {
  const counts = Object.fromEntries(REGISTRY_STATES.map((state) => [state, 0]));
  models.forEach((model) => {
    if (Object.prototype.hasOwnProperty.call(counts, model?.state)) counts[model.state] += 1;
  });
  return counts;
}

async function requestModels(signal) {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/models`, { credentials: 'include', signal });
  if (response.ok) {
    const models = await response.json();
    if (!Array.isArray(models)) throw new ModelOverviewApiError({ status: response.status, code: 'MODEL_REGISTRY_RESPONSE_INVALID' });
    return models;
  }
  let body = {};
  try { body = await response.json(); } catch (_) { /* response body is optional */ }
  throw new ModelOverviewApiError({ status: response.status, code: body.code, message: body.message });
}

export function createLiveModelOverviewAdapter() {
  return {
    async load({ signal }) {
      const models = await requestModels(signal);
      return { models, registryStateCounts: deriveRegistryStateCounts(models) };
    },
  };
}
