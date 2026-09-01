const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class ModelReleasesApiError extends Error {
  constructor({ status, code, message, source = 'MODEL_RELEASES_API_ERROR' } = {}) {
    super(message || code || source); this.name = 'ModelReleasesApiError'; this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : source);
  }
}

function isObject(value) { return value !== null && typeof value === 'object'; }
async function request(path, { signal, method = 'GET', body, headers } = {}) {
  let response;
  try { response = await fetch(`${API_BASE_URL}${path}`, { method, credentials: 'include', signal, ...(body === undefined ? { ...(headers ? { headers } : {}) } : { headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) }); }
  catch (error) { if (error?.name === 'AbortError') throw error; throw new ModelReleasesApiError(); }
  let payload = null;
  try { payload = await response.json(); } catch (_) { /* error bodies are optional */ }
  if (!response.ok) throw new ModelReleasesApiError({ status: response.status, code: payload?.code, message: payload?.message });
  return payload;
}
function normalizeAccess(payload) { if (!isObject(payload) || !Array.isArray(payload.permissions)) throw new ModelReleasesApiError({ code: 'ADMIN_ACCESS_UNAVAILABLE', source: 'ADMIN_ACCESS_UNAVAILABLE' }); return payload.permissions.filter((permission) => typeof permission === 'string'); }
function normalizeModels(payload) { if (!Array.isArray(payload) || !payload.every((model) => isObject(model) && typeof model.id === 'number' && Number.isFinite(model.id) && typeof model.version === 'string' && typeof model.state === 'string' && typeof model.createdAt === 'string')) throw new ModelReleasesApiError({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' }); return payload; }
function normalizeRuntime(payload) { if (!isObject(payload) || payload.status !== 'NORMAL' || typeof payload.modelVersion !== 'string' || !payload.modelVersion || !/^[0-9a-f]{64}$/.test(payload.artifactSha256 || '') || typeof payload.modelSource !== 'string' || !payload.modelSource || typeof payload.loadedAt !== 'string' || JSON.stringify(payload.supportedHorizons) !== JSON.stringify([60, 120, 180, 240]) || JSON.stringify(payload.supportedQuantities) !== JSON.stringify([1, 2, 3, 4, 5])) throw new ModelReleasesApiError({ code: 'MODEL_RUNTIME_RESPONSE_INVALID' }); return payload; }
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
function loadRuntime(signal, permissions) { return permissions.includes('MODEL_METRICS_READ') ? sourceResult(request('/api/v1/admin/model-runtime', { signal }), normalizeRuntime) : Promise.resolve(accessLimited('MODEL_METRICS_READ')); }
function loadRegistry(signal, permissions) { return permissions.includes('MODEL_METRICS_READ') ? sourceResult(request('/api/v1/admin/models', { signal }), normalizeModels) : Promise.resolve(accessLimited('MODEL_METRICS_READ')); }
function loadHistory(_, permissions) { return Promise.resolve(permissions.includes('AUDIT_READ') ? { state: 'UNAVAILABLE', code: 'MODEL_LIFECYCLE_AUDIT_SCOPE_UNAVAILABLE' } : accessLimited('AUDIT_READ')); }
function actionPath(type, id) { return type === 'ROLLBACK' ? '/api/v1/admin/models/rollback' : `/api/v1/admin/models/${id}/${type.toLowerCase()}`; }

export function createLiveModelReleasesAdapter() {
  return {
    async load({ signal }) { const permissions = await loadAccess(signal); const [runtime, registry, history] = await Promise.all([loadRuntime(signal, permissions), loadRegistry(signal, permissions), loadHistory(signal, permissions)]); return { permissions, runtime, registry, history }; },
    async refresh({ signal, permissions }) { const current = permissions || []; const [runtime, registry, history] = await Promise.all([loadRuntime(signal, current), loadRegistry(signal, current), loadHistory(signal, current)]); return { runtime, registry, history }; },
    async action({ type, id, payload, signal }) { const csrf = await request('/api/v1/auth/csrf', { signal }); return request(actionPath(type, id), { signal, method: 'POST', headers: { [csrf.headerName]: csrf.token }, body: payload }); },
  };
}
