import { createSystemSupportAdapter } from './systemSupportAdapter';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
const sourceQuestion = { id: 7123, title: '대여 문의', body: '본문', category: 'SERVICE', visibility: 'PUBLIC', status: 'PENDING', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T01:00:00Z', isAuthor: true, email: 'person@example.com', providerId: 'oauth-id', answers: [{ id: 9917, body: '답변', createdAt: '2026-08-31T02:00:00Z' }] };

describe('system support adapter', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('loads access and questions with credentials then exposes only safe local UI data', async () => {
    global.fetch.mockResolvedValueOnce(response({ permissions: ['QNA_READ', 'QNA_ANSWER'] })).mockResolvedValueOnce(response({ items: [sourceQuestion] }));
    const result = await createSystemSupportAdapter().load();
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/admin/access', expect.objectContaining({ credentials: 'include' }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/admin/qna/questions', expect.objectContaining({ credentials: 'include' }));
    expect(result.permissions).toEqual(['QNA_READ', 'QNA_ANSWER']);
    expect(result.items[0]).toEqual({ key: 'support-item-1', title: '대여 문의', body: '본문', category: 'SERVICE', visibility: 'PUBLIC', status: 'PENDING', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T01:00:00Z', answers: [{ body: '답변', createdAt: '2026-08-31T02:00:00Z' }] });
    expect(JSON.stringify(result)).not.toMatch(/7123|9917|person@example|oauth-id/);
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'ADMIN_ACCESS_DENIED'], [403, 'ADMIN_PERMISSION_DENIED'], [500, 'QNA_READ_FAILED']])('preserves read error %i %s', async (status, code) => {
    global.fetch.mockResolvedValueOnce(response({ permissions: [] })).mockResolvedValueOnce(response({ code }, status));
    await expect(createSystemSupportAdapter().load()).rejects.toMatchObject({ status, code });
  });

  test('does not expose an arbitrary source error code that contains an opaque ID', async () => {
    global.fetch.mockResolvedValueOnce(response({ permissions: [] })).mockResolvedValueOnce(response({ code: 'QNA_7123_PRIVATE' }, 500));
    await expect(createSystemSupportAdapter().load()).rejects.toMatchObject({ code: 'QNA_READ_FAILED', message: 'QNA_READ_FAILED' });
  });

  test('uses CSRF and only resolves the server request key privately for actions', async () => {
    global.fetch.mockResolvedValueOnce(response({ permissions: ['QNA_ANSWER', 'QNA_HIDE'] })).mockResolvedValueOnce(response({ items: [sourceQuestion] }));
    const adapter = createSystemSupportAdapter(); const page = await adapter.load();
    global.fetch.mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })).mockResolvedValueOnce(response({}));
    await adapter.answer(page.items[0].key, '처리 답변');
    expect(global.fetch).toHaveBeenNthCalledWith(3, 'http://localhost:8080/api/v1/auth/csrf', expect.objectContaining({ credentials: 'include' }));
    expect(global.fetch).toHaveBeenNthCalledWith(4, 'http://localhost:8080/api/v1/admin/qna/questions/7123/answer', expect.objectContaining({ credentials: 'include', method: 'POST', headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'csrf' }), body: JSON.stringify({ body: '처리 답변' }) }));
    global.fetch.mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })).mockResolvedValueOnce(response({}));
    await adapter.hide(page.items[0].key);
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8080/api/v1/admin/qna/questions/7123/hide', expect.objectContaining({ credentials: 'include', method: 'POST', headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'csrf' }) }));
  });

  test('propagates abort signals and rejects malformed source data', async () => {
    const signal = new AbortController().signal;
    global.fetch.mockResolvedValueOnce(response({ permissions: [] })).mockResolvedValueOnce(response({ items: [] }));
    await createSystemSupportAdapter().load({ signal });
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8080/api/v1/admin/qna/questions', expect.objectContaining({ signal }));
    global.fetch.mockResolvedValueOnce(response({ permissions: [] })).mockResolvedValueOnce(response({ items: [{ ...sourceQuestion, id: 'bad' }] }));
    await expect(createSystemSupportAdapter().load()).rejects.toMatchObject({ code: 'QNA_RESPONSE_MALFORMED' });
  });
});
