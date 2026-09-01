import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminV2Shell from './AdminV2Shell';

const props = {
  consoles: [], activeConsole: 'OPS', activeRoute: null,
  access: { adminRoles: ['SUPER_ADMIN'], permissions: [], generatedAt: null, source: 'LIVE' },
  onConsoleSelect: jest.fn(), onRouteNavigate: jest.fn(), showLogout: true,
};

describe('AdminV2Shell logout', () => {
  test('shows logout only when requested by the live shell', () => {
    const { rerender } = render(<AdminV2Shell {...props} />);
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    rerender(<AdminV2Shell {...props} showLogout={false} />);
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  test('uses the provided logout flow and redirects after success', async () => {
    const logoutAction = jest.fn().mockResolvedValue();
    const navigateToLogin = jest.fn();
    render(<AdminV2Shell {...props} logoutAction={logoutAction} navigateToLogin={navigateToLogin} />);

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(screen.getByRole('button', { name: '로그아웃 중' })).toBeDisabled();
    await waitFor(() => expect(navigateToLogin).toHaveBeenCalledWith('/login?logout=success'));
    expect(logoutAction).toHaveBeenCalledTimes(1);
  });

  test('keeps the shell and offers retry after logout failure', async () => {
    const logoutAction = jest.fn().mockRejectedValue(new Error('failed'));
    render(<AdminV2Shell {...props} logoutAction={logoutAction} navigateToLogin={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('로그아웃에 실패했습니다. 다시 시도해 주세요.');
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled();
    expect(screen.getByLabelText('현재 관리자 권한')).toBeInTheDocument();
  });
});
