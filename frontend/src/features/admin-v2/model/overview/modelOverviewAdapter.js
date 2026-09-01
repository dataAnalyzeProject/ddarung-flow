import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export const REGISTRY_STATES = ['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'RETIRED'];

export class ModelOverviewApiError extends Error {
  constructor({ status, code, message } = {}) {
    super(message || code || '모델 정보를 불러오지 못했습니다.');
    this.name = 'ModelOverviewApiError'; this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'MODEL_OVERVIEW_API_ERROR');
  }
}

export function deriveRegistryStateCounts(models) {
  const counts = Object.fromEntries(REGISTRY_STATES.map((state) => [state, 0]));
  models.forEach((model) => { if (Object.prototype.hasOwnProperty.call(counts, model?.state)) counts[model.state] += 1; });
  return counts;
}

async function request(path, signal) {
  let response;
  try { response = await adminFetch(`${API_BASE_URL}${path}`, { credentials: 'include', signal }); }
  catch (error) { if (error?.name === 'AbortError') throw error; throw new ModelOverviewApiError(); }
  let body = null;
  try { body = await response.json(); } catch (_) { /* error body is optional */ }
  if (!response.ok) throw new ModelOverviewApiError({ status: response.status, code: body?.code, message: body?.message });
  return body;
}

function normalizeModels(models) {
  if (!Array.isArray(models)) throw new ModelOverviewApiError({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' });
  return models;
}

function normalizeRuntime(runtime) {
  if (!runtime || runtime.status !== 'NORMAL' || typeof runtime.modelVersion !== 'string' || !runtime.modelVersion
    || !/^[0-9a-f]{64}$/.test(runtime.artifactSha256 || '') || typeof runtime.modelSource !== 'string'
    || !runtime.modelSource || typeof runtime.loadedAt !== 'string'
    || JSON.stringify(runtime.supportedHorizons) !== JSON.stringify([60, 120, 180, 240])
    || JSON.stringify(runtime.supportedQuantities) !== JSON.stringify([1, 2, 3, 4, 5])) {
    throw new ModelOverviewApiError({ code: 'MODEL_RUNTIME_RESPONSE_INVALID' });
  }
  return runtime;
}

function sourceResult(promise, normalize) {
  return promise.then((data) => ({ state: 'SUCCESS', data: normalize(data) })).catch((error) => {
    if (error?.name === 'AbortError') throw error;
    return { state: error?.status === 401 || error?.status === 403 ? 'FORBIDDEN' : 'ERROR', error };
  });
}

export function createLiveModelOverviewAdapter() {
  return {
    async load({ signal }) {
      const [runtime, registry] = await Promise.all([
        sourceResult(request('/api/v1/admin/model-runtime', signal), normalizeRuntime),
        sourceResult(request('/api/v1/admin/models', signal), normalizeModels),
      ]);
      return {
        runtime,
        registry,
        models: registry.state === 'SUCCESS' ? registry.data : [],
        registryStateCounts: registry.state === 'SUCCESS' ? deriveRegistryStateCounts(registry.data) : null,
      };
    },
  };
}
