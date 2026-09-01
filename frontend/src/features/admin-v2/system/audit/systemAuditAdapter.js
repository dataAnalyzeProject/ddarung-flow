import { adminFetch } from '../../auth/adminSession.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
const SAFE_RESULT_VALUES = new Set(['SUCCESS', 'FAILURE']);

export class SystemAuditApiError extends Error {
  constructor({ status, code = 'AUDIT_READ_FAILED' } = {}) {
    super(code);
    this.name = 'SystemAuditApiError';
    this.status = status;
    this.code = code;
  }
}

function addIfPresent(params, name, value) {
  if (typeof value === 'string' && value.trim()) params.set(name, value.trim());
}

export function createSystemAuditQuery({ action = '', result = '', reasonCode = '', from = '', to = '', page = 0, size = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  addIfPresent(params, 'action', action);
  if (SAFE_RESULT_VALUES.has(result)) params.set('result', result);
  addIfPresent(params, 'reasonCode', reasonCode);
  addIfPresent(params, 'from', from);
  addIfPresent(params, 'to', to);
  return params.toString();
}

function isNumber(value) { return typeof value === 'number' && Number.isFinite(value); }

function normalizeItem(item) {
  if (!item || typeof item !== 'object'
    || typeof item.action !== 'string'
    || typeof item.targetType !== 'string'
    || !Array.isArray(item.actorRoleCodes)
    || !item.actorRoleCodes.every((role) => typeof role === 'string')
    || !SAFE_RESULT_VALUES.has(item.result)
    || (item.reasonCode !== null && typeof item.reasonCode !== 'string')
    || typeof item.occurredAt !== 'string'
    || Number.isNaN(new Date(item.occurredAt).getTime())) {
    throw new SystemAuditApiError({ code: 'AUDIT_RESPONSE_MALFORMED' });
  }
  return {
    action: item.action,
    targetType: item.targetType,
    actorRoleCodes: [...item.actorRoleCodes],
    result: item.result,
    reasonCode: item.reasonCode,
    occurredAt: item.occurredAt,
  };
}

export function normalizeSystemAuditPage(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)
    || !isNumber(payload.page) || !isNumber(payload.size) || !isNumber(payload.total)) {
    throw new SystemAuditApiError({ code: 'AUDIT_RESPONSE_MALFORMED' });
  }
  return { items: payload.items.map(normalizeItem), page: payload.page, size: payload.size, total: payload.total };
}

export function createSystemAuditAdapter() {
  return {
    async load({ signal, ...query } = {}) {
      let response;
      try {
        response = await adminFetch(`${API_BASE_URL}/api/v1/admin/system/audit-logs?${createSystemAuditQuery(query)}`, { credentials: 'include', signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new SystemAuditApiError();
      }
      if (!response.ok) {
        let body = {};
        try {
          body = await response.json();
        } catch (_) { /* response body is optional */ }
        const fallback = response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'AUDIT_READ_FAILED';
        const code = typeof body?.code === 'string' ? body.code : fallback;
        throw new SystemAuditApiError({ status: response.status, code });
      }
      try {
        return normalizeSystemAuditPage(await response.json());
      } catch (error) {
        if (error instanceof SystemAuditApiError) throw error;
        throw new SystemAuditApiError({ code: 'AUDIT_RESPONSE_MALFORMED' });
      }
    },
  };
}
