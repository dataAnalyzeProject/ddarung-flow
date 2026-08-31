import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SystemAuditPage from './SystemAuditPage';

const safeItem = { action: 'ROLE_CHANGE', targetType: 'USER', actorRoleCodes: ['AUDITOR', 'ACCESS_ADMIN'], result: 'SUCCESS', reasonCode: 'ROLE_CHANGED', occurredAt: '2026-08-31T09:00:00+09:00' };
const response = { items: [safeItem], page: 0, size: 20, total: 21 };
function adapterFor(load) { return () => ({ load }); }
function deferred() { let resolve; return { promise: new Promise((done) => { resolve = done; }), resolve }; }

describe('SystemAuditPage', () => {
  test('renders loading, success table, and semantic result status', async () => {
    const pending = deferred();
    render(<SystemAuditPage createAdapter={adapterFor(() => pending.promise)} />);
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    await act(async () => pending.resolve(response));
    expect(await screen.findByRole('heading', { name: '관리자 변경 이력' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '관리자 변경 이력' })).toHaveTextContent('ROLE_CHANGEUSERAUDITOR, ACCESS_ADMINSUCCESSROLE_CHANGED');
    expect(screen.getByLabelText('결과: SUCCESS')).toBeInTheDocument();
  });

  test('keeps filters visible for an empty successful response', async () => {
    render(<SystemAuditPage createAdapter={adapterFor(() => Promise.resolve({ items: [], page: 0, size: 20, total: 0 }))} />);
    expect(await screen.findByText('표시할 항목 없음')).toBeInTheDocument();
    expect(screen.getByLabelText('감사 이력 필터')).toBeInTheDocument();
  });

  test.each([[401, 'AUTH_REQUIRED'], [403, 'AUDIT_PERMISSION_DENIED']])('fails closed for %i with AUDIT_READ', async (status, code) => {
    render(<SystemAuditPage createAdapter={adapterFor(() => Promise.reject({ status, code }))} />);
    expect(await screen.findByText(`필요 권한: AUDIT_READ`)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('renders network or server failures without stale rows and can retry', async () => {
    const load = jest.fn().mockRejectedValueOnce({ status: 500, code: 'AUDIT_READ_FAILED' }).mockResolvedValueOnce(response);
    render(<SystemAuditPage createAdapter={adapterFor(load)} />);
    expect(await screen.findByText('AUDIT_READ_FAILED')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  test('shows ERROR instead of a table for a malformed audit response', async () => {
    render(<SystemAuditPage createAdapter={adapterFor(() => Promise.reject({ code: 'AUDIT_RESPONSE_MALFORMED' }))} />);
    expect(await screen.findByText('AUDIT_RESPONSE_MALFORMED')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('submits exact filters at page zero and reset clears them', async () => {
    const load = jest.fn().mockResolvedValue(response);
    render(<SystemAuditPage createAdapter={adapterFor(load)} />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('작업'), { target: { value: 'ROLE_CHANGE' } });
    fireEvent.change(screen.getByLabelText('결과'), { target: { value: 'FAILURE' } });
    fireEvent.change(screen.getByLabelText('사유 코드'), { target: { value: 'DENIED' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '2026-08-31T09:00' } });
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '2026-08-31T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'ROLE_CHANGE', result: 'FAILURE', reasonCode: 'DENIED', from: expect.stringMatching(/Z$/), to: expect.stringMatching(/Z$/), page: 0, size: 20 })));
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ action: '', result: '', reasonCode: '', from: '', to: '', page: 0, size: 20 })));
  });

  test('resets the page when filters are submitted and paginates previous and next', async () => {
    const load = jest.fn(({ page }) => Promise.resolve({ ...response, page }));
    render(<SystemAuditPage createAdapter={adapterFor(load)} />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
    fireEvent.change(screen.getByLabelText('작업'), { target: { value: 'ROLE_CHANGE' } });
    fireEvent.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'ROLE_CHANGE', page: 0 })));
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })));
  });

  test('prevents an invalid date range before requesting', async () => {
    const load = jest.fn().mockResolvedValue(response);
    render(<SystemAuditPage createAdapter={adapterFor(load)} />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '2026-08-31T11:00' } });
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '2026-08-31T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '조회' }));
    expect(screen.getByRole('alert')).toHaveTextContent('시작 시각은 종료 시각보다 늦을 수 없습니다.');
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('does not retain or render prohibited response fields', async () => {
    const unsafe = { ...safeItem, targetId: 'internal-target', targetPublicId: 'public-target', correlationId: 'private-correlation', actorRole: 'ADMIN', actorUserId: 19, email: 'person@example.com' };
    render(<SystemAuditPage createAdapter={adapterFor(() => Promise.resolve({ items: [{ action: unsafe.action, targetType: unsafe.targetType, actorRoleCodes: unsafe.actorRoleCodes, result: unsafe.result, reasonCode: unsafe.reasonCode, occurredAt: unsafe.occurredAt }], page: 0, size: 20, total: 1 }))} />);
    await screen.findByRole('table');
    expect(document.body.textContent).not.toMatch(/internal-target|public-target|private-correlation|person@example\.com/);
    expect(document.body.textContent).not.toMatch(/actorUserId/);
  });

  test('ignores a slower stale response after a new filter request', async () => {
    const initial = deferred(); const filtered = deferred();
    const load = jest.fn(({ action }) => action === 'ROLE_CHANGE' ? filtered.promise : initial.promise);
    render(<SystemAuditPage createAdapter={adapterFor(load)} />);
    fireEvent.change(screen.getByLabelText('작업'), { target: { value: 'ROLE_CHANGE' } });
    fireEvent.click(screen.getByRole('button', { name: '조회' }));
    await act(async () => initial.resolve({ ...response, items: [{ ...safeItem, action: 'STALE_ACTION' }] }));
    await act(async () => filtered.resolve(response));
    expect(await screen.findByRole('table')).toHaveTextContent('ROLE_CHANGE');
    expect(screen.queryByText('STALE_ACTION')).not.toBeInTheDocument();
  });

  test('contains no write, edit, or delete controls', async () => {
    render(<SystemAuditPage createAdapter={adapterFor(() => Promise.resolve(response))} />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /삭제|수정|편집|등록|저장/ })).not.toBeInTheDocument();
  });
});
