const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
const SAFE_ERROR_CODES = new Set(['AUTH_REQUIRED', 'ADMIN_ACCESS_DENIED', 'ADMIN_PERMISSION_DENIED', 'QNA_CONFLICT', 'QNA_NOT_FOUND', 'QNA_ACCESS_DENIED', 'QNA_INVALID_REQUEST', 'CSRF_TOKEN_UNAVAILABLE']);

export class SystemSupportApiError extends Error {
  constructor({ status, code, fallback = 'QNA_READ_FAILED' } = {}) {
    const normalizedCode = SAFE_ERROR_CODES.has(code) ? code : (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : fallback);
    super(normalizedCode);
    this.name = 'SystemSupportApiError';
    this.status = status;
    this.code = normalizedCode;
  }
}

function isObject(value) { return value !== null && typeof value === 'object'; }
function validDate(value) { return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()); }

async function request(path, { signal, method = 'GET', body, headers } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      signal,
      ...(body === undefined ? { ...(headers ? { headers } : {}) } : { headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new SystemSupportApiError({ fallback: method === 'GET' ? 'QNA_READ_FAILED' : 'QNA_ACTION_FAILED' });
  }
  let payload = null;
  try { payload = await response.json(); } catch (_) { /* error payloads are optional */ }
  if (!response.ok) throw new SystemSupportApiError({ status: response.status, code: typeof payload?.code === 'string' ? payload.code : undefined, fallback: method === 'GET' ? 'QNA_READ_FAILED' : 'QNA_ACTION_FAILED' });
  return payload;
}

function accessPermissions(payload) {
  return isObject(payload) && Array.isArray(payload.permissions) ? payload.permissions.filter((permission) => typeof permission === 'string') : [];
}

function normalizeAnswer(answer) {
  if (!isObject(answer) || typeof answer.body !== 'string' || !validDate(answer.createdAt)) throw new SystemSupportApiError({ fallback: 'QNA_RESPONSE_MALFORMED' });
  return { body: answer.body, createdAt: answer.createdAt };
}

function normalizeQuestion(question, localKey) {
  if (!isObject(question) || typeof question.title !== 'string' || typeof question.body !== 'string'
    || typeof question.category !== 'string' || typeof question.visibility !== 'string' || typeof question.status !== 'string'
    || !validDate(question.createdAt) || !validDate(question.updatedAt) || !Array.isArray(question.answers)) {
    throw new SystemSupportApiError({ fallback: 'QNA_RESPONSE_MALFORMED' });
  }
  return { key: localKey, title: question.title, body: question.body, category: question.category, visibility: question.visibility, status: question.status, createdAt: question.createdAt, updatedAt: question.updatedAt, answers: question.answers.map(normalizeAnswer) };
}

export function createSystemSupportAdapter() {
  // Numeric server IDs never leave this closure. UI keys are independent counters, not encodings.
  const serverIdByKey = new Map();
  const keyByServerId = new Map();
  let nextKey = 0;
  const localKeyFor = (serverId) => {
    if (typeof serverId !== 'number' || !Number.isFinite(serverId)) throw new SystemSupportApiError({ fallback: 'QNA_RESPONSE_MALFORMED' });
    if (!keyByServerId.has(serverId)) {
      const localKey = `support-item-${++nextKey}`;
      keyByServerId.set(serverId, localKey);
      serverIdByKey.set(localKey, serverId);
    }
    return keyByServerId.get(serverId);
  };
  const serverIdFor = (key) => {
    const serverId = serverIdByKey.get(key);
    if (serverId === undefined) throw new SystemSupportApiError({ fallback: 'QNA_ACTION_KEY_INVALID' });
    return serverId;
  };
  const loadQuestions = async (signal) => {
    const payload = await request('/api/v1/admin/qna/questions', { signal });
    if (!isObject(payload) || !Array.isArray(payload.items)) throw new SystemSupportApiError({ fallback: 'QNA_RESPONSE_MALFORMED' });
    return payload.items.map((question) => normalizeQuestion(question, localKeyFor(question?.id)));
  };
  const csrfPost = async (path, body, signal) => {
    const csrf = await request('/api/v1/auth/csrf', { signal });
    if (!isObject(csrf) || typeof csrf.headerName !== 'string' || typeof csrf.token !== 'string') throw new SystemSupportApiError({ fallback: 'CSRF_TOKEN_UNAVAILABLE' });
    return request(path, { signal, method: 'POST', headers: { [csrf.headerName]: csrf.token }, body });
  };
  return {
    async load({ signal } = {}) {
      const [permissions, items] = await Promise.all([
        request('/api/v1/admin/access', { signal }).then(accessPermissions).catch((error) => { if (error?.name === 'AbortError') throw error; return []; }),
        loadQuestions(signal),
      ]);
      return { permissions, items };
    },
    answer(key, body, { signal } = {}) { return csrfPost(`/api/v1/admin/qna/questions/${serverIdFor(key)}/answer`, { body }, signal); },
    hide(key, { signal } = {}) { return csrfPost(`/api/v1/admin/qna/questions/${serverIdFor(key)}/hide`, undefined, signal); },
  };
}
