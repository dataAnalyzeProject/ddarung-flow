import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SystemAccessPage, { classifyAssignments, permissionImpact } from './SystemAccessPage';

const opaqueId = '22222222-2222-4222-8222-222222222222';
const catalog = [
  { roleCode: 'OPS_VIEWER', displayName: '운영 조회자', description: '운영 현황을 봅니다.', permissions: ['OPS_DASHBOARD_READ'], systemRole: false, protectedRole: false },
  { roleCode: 'OPS_MANAGER', displayName: '운영 기준 관리자', description: '운영 기준을 관리합니다.', permissions: ['OPS_THRESHOLD_MANAGE'], systemRole: true, protectedRole: false },
  { roleCode: 'SUPER_ADMIN', displayName: '최고 관리자', description: '전체 권한입니다.', permissions: ['ACCESS_READ', 'ACCESS_ASSIGN', 'ACCESS_REVOKE'], systemRole: true, protectedRole: true },
];
const page = { access: { permissions: ['ACCESS_READ', 'ACCESS_ASSIGN', 'ACCESS_REVOKE'] }, roles: catalog, users: { items: [{ userId: opaqueId, displayName: '관리자 A', role: 'ADMIN', adminRoles: [{ roleCode: 'OPS_VIEWER', expiresAt: null }], protectedUser: false, version: 7 }], page: 0, size: 20, total: 21 } };
const detail = { publicUserId: opaqueId, displayName: '관리자 A', accountRole: 'ADMIN', adminRoles: [{ roleCode: 'OPS_VIEWER', expiresAt: null }], protectedUser: false, version: 7 };

function adapterFor(overrides = {}) { return () => ({ loadPage: jest.fn().mockResolvedValue(page), loadUser: jest.fn().mockResolvedValue(detail), replaceRoles: jest.fn().mockResolvedValue(detail), ...overrides }); }

describe('SystemAccessPage helpers', () => {
  test('classifies complete desired-set changes and derives catalog permission impact', () => {
    expect(classifyAssignments([{ roleCode: 'A', expiresAt: null }, { roleCode: 'B', expiresAt: '2026-12-01T00:00:00Z' }], [{ roleCode: 'B', expiresAt: '2026-11-01T00:00:00Z' }, { roleCode: 'C', expiresAt: null }])).toEqual(expect.arrayContaining([{ roleCode: 'A', type: 'REMOVED' }, { roleCode: 'B', type: 'EXPIRY_REDUCED' }, { roleCode: 'C', type: 'ADDED' }]));
    expect(permissionImpact([{ roleCode: 'A' }], [{ roleCode: 'B' }], [{ roleCode: 'A', permissions: ['READ'] }, { roleCode: 'B', permissions: ['WRITE'] }])).toEqual({ gained: ['WRITE'], lost: ['READ'] });
  });
});

describe('SystemAccessPage', () => {
  test('renders only approved display identity and never exposes opaque or sensitive fixture fields', async () => {
    render(<SystemAccessPage createAdapter={adapterFor()} />);
    expect(await screen.findByRole('button', { name: /관리자 A/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(opaqueId);
    expect(document.body.innerHTML).not.toMatch(/email|oauth|provider|internal.*id/i);
  });

  test('maps search and pagination to the actual backend page query', async () => {
    const loadPage = jest.fn().mockResolvedValue(page);
    render(<SystemAccessPage createAdapter={adapterFor({ loadPage })} />);
    await screen.findByRole('button', { name: /관리자 A/ });
    expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, size: 20, sort: 'displayName,asc', q: '' }));
    fireEvent.change(screen.getByLabelText('사용자 검색'), { target: { value: '운영' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() => expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, q: '운영' })));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, q: '운영' })));
  });

  test('has distinct empty, authentication, permission, and generic page states', async () => {
    const { rerender } = render(<SystemAccessPage createAdapter={adapterFor({ loadPage: jest.fn().mockResolvedValue({ ...page, users: { ...page.users, items: [] } }) })} />);
    expect(await screen.findByText('표시할 사용자가 없습니다.')).toBeInTheDocument();
    rerender(<SystemAccessPage createAdapter={adapterFor({ loadPage: jest.fn().mockRejectedValue({ status: 401, code: 'AUTH_REQUIRED' }) })} />);
    expect(await screen.findByText('AUTH_REQUIRED')).toBeInTheDocument();
    rerender(<SystemAccessPage createAdapter={adapterFor({ loadPage: jest.fn().mockRejectedValue({ status: 403, code: 'ADMIN_PERMISSION_DENIED' }) })} />);
    expect(await screen.findByText('필요 권한: ACCESS_READ')).toBeInTheDocument();
    rerender(<SystemAccessPage createAdapter={adapterFor({ loadPage: jest.fn().mockRejectedValue({ status: 500, code: 'REQUEST_FAILED' }) })} />);
    expect(await screen.findByText('REQUEST_FAILED')).toBeInTheDocument();
  });

  test('loads selected user detail without clearing the list and shows catalog-driven roles', async () => {
    render(<SystemAccessPage createAdapter={adapterFor()} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    expect(await screen.findByRole('heading', { name: '관리자 A' })).toBeInTheDocument();
    const roleGroup = screen.getByRole('group', { name: '요청할 관리자 역할 전체' });
    expect(roleGroup).toHaveTextContent('운영 조회자');
    expect(roleGroup).toHaveTextContent('최고 관리자');
    expect(screen.getByRole('button', { name: /관리자 A/ })).toBeInTheDocument();
  });

  test('shows current protected and high-risk state separately', async () => {
    const highRiskDetail = { ...detail, adminRoles: [{ roleCode: 'OPS_MANAGER', expiresAt: null }], protectedUser: false };
    render(<SystemAccessPage createAdapter={adapterFor({ loadUser: jest.fn().mockResolvedValue(highRiskDetail) })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    expect(screen.getByText('보호 정보 없음')).toBeInTheDocument();
    expect(screen.getAllByText('운영 기준 관리자').length).toBeGreaterThan(0);
  });

  test('ACCESS_READ alone cannot enable either grant or revoke request', async () => {
    const readOnly = { ...page, access: { permissions: ['ACCESS_READ'] } };
    render(<SystemAccessPage createAdapter={adapterFor({ loadPage: jest.fn().mockResolvedValue(readOnly) })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('최고 관리자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '역할 추가' } });
    expect(screen.getByText(/ACCESS_ASSIGN 권한이 없어/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 검토 및 저장' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('최고 관리자 역할'));
    fireEvent.click(screen.getByLabelText('운영 조회자 역할'));
    expect(screen.getByText(/ACCESS_REVOKE 권한이 없어/)).toBeInTheDocument();
  });

  test('requires a confirmation and submits complete requested assignments with exact version and normalized reason', async () => {
    const replaceRoles = jest.fn().mockResolvedValue(detail);
    render(<SystemAccessPage createAdapter={adapterFor({ replaceRoles })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('최고 관리자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '  긴급   역할 추가  ' } });
    fireEvent.click(screen.getByRole('button', { name: '변경 검토 및 저장' }));
    expect(replaceRoles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }));
    await waitFor(() => expect(replaceRoles).toHaveBeenCalledWith(opaqueId, { expectedVersion: 7, assignments: [{ roleCode: 'OPS_VIEWER', expiresAt: null }, { roleCode: 'SUPER_ADMIN', expiresAt: null }], reason: '긴급 역할 추가' }));
  });

  test('refreshes the selected detail and list row after a successful update', async () => {
    const refreshed = { ...detail, version: 8, adminRoles: [{ roleCode: 'OPS_VIEWER', expiresAt: '2030-01-01T00:00:00Z' }] };
    const loadUser = jest.fn().mockResolvedValueOnce(detail).mockResolvedValueOnce(refreshed);
    render(<SystemAccessPage createAdapter={adapterFor({ loadUser, replaceRoles: jest.fn().mockResolvedValue(null) })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('운영 조회자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '역할 해제' } });
    fireEvent.click(screen.getByRole('button', { name: '변경 검토 및 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }));
    await waitFor(() => expect(loadUser).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('역할 정보를 새로 고쳤습니다.')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  test('ignores a stale detail response after the selected user changes', async () => {
    let resolveFirst; let resolveSecond;
    const secondId = '33333333-3333-4333-8333-333333333333';
    const twoUsers = { ...page, users: { ...page.users, items: [...page.users.items, { ...page.users.items[0], userId: secondId, displayName: '관리자 B' }], total: 2 } };
    const loadUser = jest.fn().mockImplementation((id) => new Promise((resolve) => { if (id === opaqueId) resolveFirst = resolve; else resolveSecond = resolve; }));
    render(<SystemAccessPage createAdapter={adapterFor({ loadPage: jest.fn().mockResolvedValue(twoUsers), loadUser })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    fireEvent.click(screen.getByRole('button', { name: /관리자 B/ }));
    resolveSecond({ ...detail, publicUserId: secondId, displayName: '관리자 B' });
    expect(await screen.findByRole('heading', { name: '관리자 B' })).toBeInTheDocument();
    resolveFirst(detail);
    await waitFor(() => expect(screen.queryByRole('heading', { name: '관리자 A' })).not.toBeInTheDocument());
  });

  test('handles source-backed mutation rejection and requires a manual conflict refresh', async () => {
    const loadUser = jest.fn().mockResolvedValue(detail);
    render(<SystemAccessPage createAdapter={adapterFor({ loadUser, replaceRoles: jest.fn().mockRejectedValue({ status: 409, code: 'ROLE_ASSIGNMENT_VERSION_CONFLICT' }) })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('운영 조회자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '역할 해제' } });
    fireEvent.click(screen.getByRole('button', { name: '변경 검토 및 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }));
    expect(await screen.findByText(/현재 역할 정보가 변경되었습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '최신 역할 다시 불러오기' }));
    await waitFor(() => expect(loadUser).toHaveBeenCalledTimes(2));
  });

  test.each(['LAST_SUPER_ADMIN_REQUIRED', 'SELF_ROLE_PROTECTED', 'ADMIN_PERMISSION_DENIED', 'VALIDATION_ERROR'])('renders the source-backed %s mutation error without inventing a replacement code', async (code) => {
    render(<SystemAccessPage createAdapter={adapterFor({ replaceRoles: jest.fn().mockRejectedValue({ status: code === 'VALIDATION_ERROR' ? 400 : 409, code }) })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('운영 조회자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '역할 해제' } });
    fireEvent.click(screen.getByRole('button', { name: '변경 검토 및 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }));
    expect(await screen.findByText(code)).toBeInTheDocument();
  });

  test('prevents a second PUT while the first confirmed request is submitting', async () => {
    const replaceRoles = jest.fn().mockImplementation(() => new Promise(() => {}));
    render(<SystemAccessPage createAdapter={adapterFor({ replaceRoles })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('운영 조회자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '역할 해제' } });
    fireEvent.click(screen.getByRole('button', { name: '변경 검토 및 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }));
    await waitFor(() => expect(replaceRoles).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '저장 중' })).toBeDisabled();
  });

  test('prevents no-op, validates short and past expiry values, and does not call legacy PATCH', async () => {
    const replaceRoles = jest.fn();
    render(<SystemAccessPage createAdapter={adapterFor({ replaceRoles })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    expect(screen.getByText('변경 없음: 저장 요청을 보내지 않습니다.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: '변경 검토 및 저장' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('운영 조회자 역할'));
    fireEvent.click(screen.getByLabelText('최고 관리자 역할'));
    fireEvent.change(screen.getByLabelText('최고 관리자 만료 시각'), { target: { value: '2020-01-01T00:00' } });
    expect(screen.getByText('만료 시각은 현재보다 이후여야 합니다.')).toBeInTheDocument();
    expect(replaceRoles).not.toHaveBeenCalled();
  });

  test('keeps detail error separate from safe user-list data', async () => {
    const loadUser = jest.fn().mockRejectedValue({ status: 404, code: 'ADMIN_USER_NOT_FOUND' });
    render(<SystemAccessPage createAdapter={adapterFor({ loadUser })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    expect(await screen.findByText('ADMIN_USER_NOT_FOUND')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /관리자 A/ })).toBeInTheDocument();
  });

  test('refreshes only after an explicit conflict action and never retries the PUT', async () => {
    const loadUser = jest.fn().mockResolvedValue(detail);
    const replaceRoles = jest.fn().mockRejectedValue({ status: 409, code: 'ROLE_ASSIGNMENT_VERSION_CONFLICT' });
    render(<SystemAccessPage createAdapter={adapterFor({ loadUser, replaceRoles })} />);
    fireEvent.click(await screen.findByRole('button', { name: /관리자 A/ }));
    await screen.findByRole('heading', { name: '관리자 A' });
    fireEvent.click(screen.getByLabelText('최고 관리자 역할'));
    fireEvent.change(screen.getByLabelText('변경 사유'), { target: { value: '긴급 역할 추가' } });
    fireEvent.click(screen.getByRole('button', { name: '변경 검토 및 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }));
    expect(await screen.findByText(/현재 역할 정보가 변경되었습니다/)).toBeInTheDocument();
    expect(replaceRoles).toHaveBeenCalledTimes(1);
    expect(loadUser).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '최신 역할 다시 불러오기' }));
    await waitFor(() => expect(loadUser).toHaveBeenCalledTimes(2));
    expect(replaceRoles).toHaveBeenCalledTimes(1);
  });
});
