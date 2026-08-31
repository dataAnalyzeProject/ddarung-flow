const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class ModelReleasesApiError extends Error {
  constructor({ status, code, message, source = 'MODEL_RELEASES_API_ERROR' } = {}) {
    super(message || code || source);
    this.name = 'ModelReleasesApiError'; this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : source);
  }
}

function isObject(value) { return value !== null && typeof value === 'object'; }
async function request(path, { signal, method = 'GET', body } = {}) {
  let response;
  try { response = await fetch(`${API_BASE_URL}${path}`, { method, credentials: 'include', signal, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); }
  catch (error) { if (error?.name === 'AbortError') throw error; throw new ModelReleasesApiError(); }
  let payload = null;
  try { payload = await response.json(); } catch (_) { /* error bodies are optional */ }
  if (!response.ok) throw new ModelReleasesApiError({ status: response.status, code: payload?.code, message: payload?.message });
  return payload;
}
function normalizeAccess(payload) { if (!isObject(payload) || !Array.isArray(payload.permissions)) throw new ModelReleasesApiError({ code: 'ADMIN_ACCESS_UNAVAILABLE', source: 'ADMIN_ACCESS_UNAVAILABLE' }); return payload.permissions.filter((permission) => typeof permission === 'string'); }
function normalizeModels(payload) { if (!Array.isArray(payload) || !payload.every((model) => isObject(model) && typeof model.id === 'number' && Number.isFinite(model.id) && typeof model.version === 'string' && typeof model.state === 'string' && typeof model.createdAt === 'string')) throw new ModelReleasesApiError({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' }); return payload; }
function normalizeBatches(payload) { if (!isObject(payload) || !Array.isArray(payload.batches) || !payload.batches.every((batch) => isObject(batch) && typeof batch.publishStatus === 'string' && typeof batch.featureAsOf === 'string' && typeof batch.expiresAt === 'string')) throw new ModelReleasesApiError({ code: 'PREDICTION_BATCH_RESPONSE_INVALID' }); return payload; }
function sourceResult(promise, normalize) { return promise.then((data) => ({ state: 'SUCCESS', data: normalize(data) })).catch((error) => { if (error?.name === 'AbortError') throw error; return { state: error?.status === 401 || error?.status === 403 ? 'FORBIDDEN' : 'ERROR', error }; }); }
function accessLimited(permission) { return { state: 'ACCESS_LIMITED', permission }; }

export function availableActions(model, permissions = []) {
  const allowed = new Set(permissions); const actions = [];
  if (allowed.has('MODEL_ARTIFACT_REGISTER')) actions.push('REGISTER');
  if (model?.state === 'DRAFT' && allowed.has('MODEL_VALIDATE')) actions.push('VALIDATE');
  if (model?.state === 'VALIDATED' && allowed.has('MODEL_APPROVE')) actions.push('APPROVE', 'REJECT');
  if (model?.state === 'APPROVED' && allowed.has('MODEL_ACTIVATE')) actions.push('ACTIVATE');
  if (allowed.has('MODEL_ROLLBACK')) actions.push('ROLLBACK');
  return actions;
}

function loadAccess(signal) { return request('/api/v1/admin/access', { signal }).then(normalizeAccess); }
function loadBatches(signal) { return sourceResult(request('/api/v1/admin/prediction-batches', { signal }), normalizeBatches); }
function loadRegistry(signal, permissions) { return permissions.includes('MODEL_METRICS_READ') ? sourceResult(request('/api/v1/admin/models', { signal }), normalizeModels) : Promise.resolve(accessLimited('MODEL_METRICS_READ')); }
function loadHistory(_, permissions) { return Promise.resolve(permissions.includes('AUDIT_READ') ? { state: 'UNAVAILABLE', code: 'MODEL_LIFECYCLE_AUDIT_SCOPE_UNAVAILABLE' } : accessLimited('AUDIT_READ')); }
function actionPath(type, id) { if (type === 'ROLLBACK') return '/api/v1/admin/models/rollback'; return `/api/v1/admin/models/${id}/${type.toLowerCase()}`; }

export function createLiveModelReleasesAdapter() {
  return {
    async load({ signal }) { const [permissions, batches] = await Promise.all([loadAccess(signal), loadBatches(signal)]); const [registry, history] = await Promise.all([loadRegistry(signal, permissions), loadHistory(signal, permissions)]); return { permissions, batches, registry, history }; },
    async refresh({ signal, permissions }) { const [registry, history] = await Promise.all([loadRegistry(signal, permissions || []), loadHistory(signal, permissions || [])]); return { registry, history }; },
    async action({ type, id, payload, signal }) { return request(actionPath(type, id), { signal, method: 'POST', body: payload }); },
  };
}
