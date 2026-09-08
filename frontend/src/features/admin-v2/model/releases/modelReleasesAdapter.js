import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export class ModelReleasesApiError extends Error {
  constructor({ status, code, message, source = 'MODEL_RELEASES_API_ERROR' } = {}) {
    super(message || code || source); this.name = 'ModelReleasesApiError'; this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : source);
  }
}

function isObject(value) { return value !== null && typeof value === 'object'; }
async function request(path, { signal, method = 'GET', body, headers, jsonBody = false } = {}) {
  const options = { method, credentials: 'include', signal, ...(headers ? { headers } : {}) };
  if (body !== undefined) {
    options.body = jsonBody ? JSON.stringify(body) : body;
    if (jsonBody) options.headers = { 'Content-Type': 'application/json', ...(headers || {}) };
  }
  let response;
  try { response = await adminFetch(`${API_BASE_URL}${path}`, options); }
  catch (error) { if (error?.name === 'AbortError') throw error; throw new ModelReleasesApiError(); }
  let payload = null;
  try { payload = await response.json(); } catch (_) { /* success may have no body */ }
  if (!response.ok) throw new ModelReleasesApiError({ status: response.status, code: payload?.code, message: payload?.message });
  return payload;
}

function normalizeAccess(payload) { if (!isObject(payload) || !Array.isArray(payload.permissions)) throw new ModelReleasesApiError({ code: 'ADMIN_ACCESS_UNAVAILABLE', source: 'ADMIN_ACCESS_UNAVAILABLE' }); return payload.permissions.filter((permission) => typeof permission === 'string'); }
function normalizeModels(payload) {
  if (!Array.isArray(payload) || !payload.every((model) => isObject(model)
    && typeof model.id === 'number' && Number.isFinite(model.id)
    && typeof model.version === 'string' && model.version
    && typeof model.state === 'string' && typeof model.createdAt === 'string'
    && SHA256_PATTERN.test(model.artifactSha256 || '')
    && (model.codeCommit === null || typeof model.codeCommit === 'string')
    && (model.featureSchemaVersion === null || typeof model.featureSchemaVersion === 'string'))) throw new ModelReleasesApiError({ code: 'MODEL_REGISTRY_RESPONSE_INVALID' });
  return payload;
}
function normalizeRuntime(payload) { if (!isObject(payload) || payload.status !== 'NORMAL' || typeof payload.modelVersion !== 'string' || !payload.modelVersion || !SHA256_PATTERN.test(payload.artifactSha256 || '') || typeof payload.modelSource !== 'string' || !payload.modelSource || typeof payload.loadedAt !== 'string' || JSON.stringify(payload.supportedHorizons) !== JSON.stringify([60, 120, 180, 240]) || JSON.stringify(payload.supportedQuantities) !== JSON.stringify([1, 2, 3, 4, 5])) throw new ModelReleasesApiError({ code: 'MODEL_RUNTIME_RESPONSE_INVALID' }); return payload; }
function normalizeHistory(payload) {
  if (!Array.isArray(payload) || !payload.every((item) => isObject(item) && typeof item.action === 'string'
    && typeof item.resourceType === 'string' && typeof item.resourceVersion === 'string'
    && typeof item.result === 'string' && (item.reasonCode === null || typeof item.reasonCode === 'string')
    && typeof item.occurredAt === 'string')) throw new ModelReleasesApiError({ code: 'MODEL_HISTORY_RESPONSE_INVALID' });
  return payload;
}
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

export async function sha256File(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !window.crypto?.subtle) throw new ModelReleasesApiError({ code: 'FILE_HASH_UNAVAILABLE' });
  const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function loadRuntime(signal, permissions) { return permissions.includes('MODEL_METRICS_READ') ? sourceResult(request('/api/v1/admin/model-runtime', { signal }), normalizeRuntime) : Promise.resolve(accessLimited('MODEL_METRICS_READ')); }
function loadRegistry(signal, permissions) { return permissions.includes('MODEL_METRICS_READ') ? sourceResult(request('/api/v1/admin/models', { signal }), normalizeModels) : Promise.resolve(accessLimited('MODEL_METRICS_READ')); }
function loadHistory(signal, permissions) { return permissions.includes('MODEL_RELEASE_READ') ? sourceResult(request('/api/v1/admin/models/history', { signal }), normalizeHistory) : Promise.resolve(accessLimited('MODEL_RELEASE_READ')); }
function actionPath(type, id) { if (type === 'ROLLBACK') return '/api/v1/admin/models/rollback'; if (type === 'RECONCILE') return '/api/v1/admin/models/reconcile-runtime'; return `/api/v1/admin/models/${id}/${type.toLowerCase()}`; }
function pause(ms) { return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }
function validEvaluation(row) {
  return isObject(row)
    && [60, 120, 180, 240].includes(row.horizonMinutes)
    && [1, 2, 3, 4, 5].includes(row.requiredBikeCount)
    && Number.isInteger(row.sampleCount) && row.sampleCount >= 0
    && ['brierScore', 'shortageRecall', 'calibrationError', 'coverage'].every((field) => typeof row[field] === 'number' && Number.isFinite(row[field]) && row[field] >= 0 && row[field] <= 1)
    && Number.isInteger(row.monotonicityViolations) && row.monotonicityViolations >= 0;
}

export function createLiveModelReleasesAdapter({ readbackAttempts = 4, readbackDelayMs = 250 } = {}) {
  async function csrf(signal) {
    const value = await request('/api/v1/auth/csrf', { signal });
    if (!isObject(value) || typeof value.headerName !== 'string' || typeof value.token !== 'string') throw new ModelReleasesApiError({ code: 'CSRF_RESPONSE_INVALID' });
    return { [value.headerName]: value.token };
  }
  async function mutate(path, { signal, method = 'POST', body, headers, jsonBody = false } = {}) {
    return request(path, { signal, method, body, jsonBody, headers: { ...(await csrf(signal)), ...(headers || {}) } });
  }
  async function refreshSources(signal, permissions) {
    const current = permissions || [];
    const [runtime, registry, history] = await Promise.all([loadRuntime(signal, current), loadRegistry(signal, current), loadHistory(signal, current)]);
    return { runtime, registry, history };
  }
  async function upload(file, signal) {
    const expectedSha256 = await sha256File(file);
    const created = await mutate('/api/v1/admin/model-uploads', { signal, body: { fileName: file.name, expectedSha256, maxBytes: file.size, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }, jsonBody: true });
    if (!isObject(created) || typeof created.id !== 'string') throw new ModelReleasesApiError({ code: 'MODEL_UPLOAD_RESPONSE_INVALID' });
    await mutate(`/api/v1/admin/model-uploads/${encodeURIComponent(created.id)}/content`, { signal, method: 'PUT', body: await file.arrayBuffer(), headers: { 'Content-Type': 'application/octet-stream' } });
    const completed = await mutate(`/api/v1/admin/model-uploads/${encodeURIComponent(created.id)}/complete`, { signal });
    if (!isObject(completed) || completed.status !== 'COMPLETED') throw new ModelReleasesApiError({ code: 'MODEL_UPLOAD_NOT_COMPLETED' });
    return { id: created.id, expectedSha256 };
  }
  return {
    async load({ signal }) { const permissions = normalizeAccess(await request('/api/v1/admin/access', { signal })); return { permissions, ...(await refreshSources(signal, permissions)) }; },
    async refresh({ signal, permissions }) { return refreshSources(signal, permissions); },
    async action({ type, id, signal }) { return mutate(actionPath(type, id), { signal }); },
    async register({ artifactFile, manifestFile, evaluationsFile, metadata, signal }) {
      let evaluations;
      try { evaluations = JSON.parse(await evaluationsFile.text()); } catch (_) { throw new ModelReleasesApiError({ code: 'MODEL_EVALUATIONS_INVALID' }); }
      const combinations = Array.isArray(evaluations) ? new Set(evaluations.map((row) => `${row?.horizonMinutes}:${row?.requiredBikeCount}`)) : new Set();
      if (!Array.isArray(evaluations) || evaluations.length !== 20 || combinations.size !== 20 || !evaluations.every(validEvaluation)) throw new ModelReleasesApiError({ code: 'MODEL_EVALUATIONS_INVALID' });
      const artifact = await upload(artifactFile, signal);
      const manifest = await upload(manifestFile, signal);
      return mutate('/api/v1/admin/models', { signal, body: { ...metadata, artifactUploadId: artifact.id, manifestUploadId: manifest.id, evaluations }, jsonBody: true });
    },
    async verifyServing({ candidateModelId, permissions, signal }) {
      let latest = null;
      for (let attempt = 0; attempt < readbackAttempts; attempt += 1) {
        latest = await refreshSources(signal, permissions);
        const expected = latest.registry?.state === 'SUCCESS' ? latest.registry.data.find((model) => model.id === candidateModelId) : null;
        if (!expected) return { state: 'UNAVAILABLE', refreshed: latest };
        if (latest.runtime?.state === 'SUCCESS' && latest.runtime.data.modelVersion === expected.version && latest.runtime.data.artifactSha256 === expected.artifactSha256) return { state: 'VERIFIED', expected, actual: latest.runtime.data, refreshed: latest };
        if (attempt + 1 < readbackAttempts) await pause(readbackDelayMs);
      }
      return { state: latest?.runtime?.state === 'SUCCESS' ? 'MISMATCH' : 'UNAVAILABLE', refreshed: latest };
    },
  };
}
