import { createSystemAuditAdapter, createSystemAuditQuery, normalizeSystemAuditPage } from './systemAuditAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

const safeItem = {
  action: 'ROLE_CHANGE', targetType: 'USER', actorRoleCodes: ['AUDITOR'], result: 'SUCCESS', reasonCode: 'ROLE_CHANGED', occurredAt: '2026-08-31T09:00:00+09:00',
};

describe('system audit adapter', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('uses the exact safe endpoint, credentials, default page and size', async () => {
    global.fetch.mockResolvedValue(response({ items: [], page: 0, size: 20, total: 0 }));
    await createSystemAuditAdapter().load();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/admin/system/audit-logs?page=0&size=20', expect.objectContaining({ credentials: 'include' }));
  });

  test('omits blank parameters and serializes only supported exact filters', () => {
    expect(createSystemAuditQuery({ action: ' ', result: 'UNKNOWN', reasonCode: '', from: '', to: '' })).toBe('page=0&size=20');
    expect(createSystemAuditQuery({ action: ' ROLE_CHANGE ', result: 'FAILURE', reasonCode: ' DENIED ', from: '2026-08-31T09:00', to: '2026-08-31T10:00', page: 2, size: 20 }))
      .toBe('page=2&size=20&action=ROLE_CHANGE&result=FAILURE&reasonCode=DENIED&from=2026-08-31T09%3A00&to=2026-08-31T10%3A00');
  });

  test('propagates AbortSignal', async () => {
    global.fetch.mockResolvedValue(response({ items: [], page: 0, size: 20, total: 0 }));
    const signal = new AbortController().signal;
    await createSystemAuditAdapter().load({ signal });
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), { credentials: 'include', signal });
  });

  test('keeps SUCCESS and FAILURE results only', () => {
    expect(normalizeSystemAuditPage({ items: [safeItem, { ...safeItem, result: 'FAILURE' }], page: 0, size: 20, total: 2 }).items.map((item) => item.result)).toEqual(['SUCCESS', 'FAILURE']);
    expect(() => normalizeSystemAuditPage({ items: [{ ...safeItem, result: 'UNKNOWN' }], page: 0, size: 20, total: 1 })).toThrow('AUDIT_RESPONSE_MALFORMED');
  });

  test('rejects malformed page payloads', () => {
    expect(() => normalizeSystemAuditPage({ items: [], page: '0', size: 20, total: 0 })).toThrow('AUDIT_RESPONSE_MALFORMED');
    expect(() => normalizeSystemAuditPage({ items: [{ ...safeItem, actorRoleCodes: 'AUDITOR' }], page: 0, size: 20, total: 1 })).toThrow('AUDIT_RESPONSE_MALFORMED');
    expect(() => normalizeSystemAuditPage({ items: [{ ...safeItem, occurredAt: 'not-a-date' }], page: 0, size: 20, total: 1 })).toThrow('AUDIT_RESPONSE_MALFORMED');
  });

  test('projects only the six safe item fields and drops prohibited response fields', () => {
    const page = normalizeSystemAuditPage({ items: [{ ...safeItem, targetId: 'internal-id', targetPublicId: 'public-id', correlationId: 'correlation', actorRole: 'ADMIN', actorUserId: 7, email: 'person@example.com', providerId: 'oauth', ip: '127.0.0.1', rawReason: 'private', modelPath: 'secret-path', token: 'secret' }], page: 0, size: 20, total: 1 });
    expect(Object.keys(page.items[0])).toEqual(['action', 'targetType', 'actorRoleCodes', 'result', 'reasonCode', 'occurredAt']);
    expect(page.items[0]).not.toHaveProperty('targetId');
    expect(page.items[0]).not.toHaveProperty('actorRole');
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'AUDIT_PERMISSION_DENIED'], [500, 'AUDIT_READ_FAILED']])('maps HTTP %i to a safe error code', async (status, code) => {
    global.fetch.mockResolvedValue(response({}, status));
    await expect(createSystemAuditAdapter().load()).rejects.toMatchObject({ status, code });
  });
});
