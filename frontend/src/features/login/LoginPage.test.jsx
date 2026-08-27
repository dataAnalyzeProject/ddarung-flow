import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';
import { LOGIN_STATUS } from './data/authDemoData';
import { savePendingPrediction, loadPendingPrediction } from './loginStorage';
import { getCurrentUser, startSocialLogin } from './authApi';

jest.mock('./authApi', () => ({
    getCurrentUser: jest.fn(() => Promise.resolve({ authenticated: false, user: null })),
    logout: jest.fn(() => Promise.resolve()),
    startSocialLogin: jest.fn(),
}));

describe('LoginPage 핵심 테스트', () => {
    beforeEach(() => {
        sessionStorage.clear();
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
    });

    test('Google, Kakao, Naver 소셜 로그인 버튼 3개가 모두 표시된다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.WAITING} />);
        expect(screen.getByTitle('Kakao 로그인')).toBeInTheDocument();
        expect(screen.getByTitle('Naver 로그인')).toBeInTheDocument();
        expect(screen.getByTitle('Google 로그인')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '네이버로 계속하기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '카카오로 계속하기' })).toBeInTheDocument();
        expect(screen.queryByText('로그인 없이 대여 예측하기')).not.toBeInTheDocument();
        expect(screen.queryByText('이용약관')).not.toBeInTheDocument();
        expect(screen.queryByText('개인정보 처리방침')).not.toBeInTheDocument();
    });

    test('LOADING 처리 중에는 버튼이 비활성화되어 중복 클릭할 수 없다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.LOADING} />);
        expect(screen.getByTitle('Kakao 로그인')).toBeDisabled();
    });

    test('OAuth 화면에서 뒤로가기로 복귀하면 진행 상태를 해제하고 다른 로그인을 선택할 수 있다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.LOADING} />);

        const restoredPageShow = new Event('pageshow');
        Object.defineProperty(restoredPageShow, 'persisted', { value: true });
        act(() => {
            window.dispatchEvent(restoredPageShow);
        });

        const naverButton = screen.getByRole('button', { name: '네이버로 계속하기' });
        expect(naverButton).not.toBeDisabled();
        fireEvent.click(naverButton);
        expect(startSocialLogin).toHaveBeenCalledWith('Naver');
    });

    test('소셜 로그인 버튼은 선택한 공급자의 OAuth 로그인을 시작한다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.WAITING} />);
        fireEvent.click(screen.getByTitle('Kakao 로그인'));
        expect(startSocialLogin).toHaveBeenCalledWith('Kakao');
    });

    test.each([
        ['Google', 'Google로 계속하기', '{enter}'],
        ['Google', 'Google로 계속하기', ' '],
        ['Naver', '네이버로 계속하기', '{enter}'],
        ['Naver', '네이버로 계속하기', ' '],
        ['Kakao', '카카오로 계속하기', '{enter}'],
        ['Kakao', '카카오로 계속하기', ' '],
    ])('%s 로그인 버튼은 %s 키 입력으로 한 번만 실행된다', (provider, accessibleName, key) => {
        render(<LoginPage initialStatus={LOGIN_STATUS.WAITING} />);
        const button = screen.getByRole('button', { name: accessibleName });
        button.focus();
        expect(button).toHaveFocus();

        userEvent.keyboard(key);

        expect(startSocialLogin).toHaveBeenCalledTimes(1);
        expect(startSocialLogin).toHaveBeenCalledWith(provider);
    });

    test('OAuth 실패 복귀 주소에서 실패 안내를 표시한다', () => {
        window.history.pushState({}, '', '/?login=failed&code=AUTH_OAUTH_FAILED');
        render(<LoginPage />);
        expect(screen.getByText(/로그인에 실패했습니다/i)).toBeInTheDocument();
        window.history.pushState({}, '', '/');
    });

    test('OAuth 취소 복귀 주소에서 취소 안내를 표시한다', () => {
        window.history.pushState({}, '', '/?login=cancelled&code=AUTH_OAUTH_CANCELLED');
        render(<LoginPage />);
        expect(screen.getByText(/로그인 취소/i)).toBeInTheDocument();
        window.history.pushState({}, '', '/');
    });

    test('초기 로그인 상태 확인이 실패해도 소셜 로그인 선택을 표시한다', async () => {
        getCurrentUser.mockRejectedValueOnce(new Error('네트워크 오류'));
        render(<LoginPage />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument();
        });
        expect(screen.queryByText('로그인에 실패했습니다.')).not.toBeInTheDocument();
    });

    test('세션 만료 복귀 주소에서 만료 안내를 표시한다', () => {
        window.history.pushState({}, '', '/?login=expired');
        render(<LoginPage />);
        expect(screen.getByText(/로그인 만료/i)).toBeInTheDocument();
        window.history.pushState({}, '', '/');
    });

    test('FAILED 상태에서 실패 안내 메시지가 표시되고 소셜 버튼으로 다시 시도할 수 있다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.FAILED} />);
        expect(screen.getByText(/로그인에 실패했습니다/i)).toBeInTheDocument();
        expect(screen.getByTitle('Kakao 로그인')).not.toBeDisabled();
    });

    test('SUCCESS 상태에서 5개 입력값을 복원하고 로그아웃할 수 있다', async () => {
        const sampleInput = {
            origin: '서울역',
            destination: '광화문',
            travelMode: 'WALK',
            directMinutes: null,
            requiredBikeCount: 2,
        };
        savePendingPrediction(sampleInput);
        expect(loadPendingPrediction()).toEqual(sampleInput);

        render(<LoginPage initialStatus={LOGIN_STATUS.SUCCESS} mockOutcome="success" />);

        await waitFor(() => {
            expect(screen.getByText('서울역')).toBeInTheDocument();
            expect(screen.getByText('광화문')).toBeInTheDocument();
        });
        expect(screen.getByText('WALK')).toBeInTheDocument();
        expect(screen.getByText(/이동수단으로 계산/i)).toBeInTheDocument();
        expect(screen.getByText('2대')).toBeInTheDocument();
        expect(screen.getByText(/입력값을 확인한 후 다시 예측해 주세요/i)).toBeInTheDocument();

        fireEvent.click(screen.getByText(/로그아웃/i));
        expect(screen.getByText(/로그아웃 되었습니다/i)).toBeInTheDocument();
    });

    test('로그인 성공만으로는 onRepeatPrediction을 자동 호출하지 않는다', () => {
        const onRepeatPrediction = jest.fn();

        render(
            <LoginPage
                initialStatus={LOGIN_STATUS.SUCCESS}
                onRepeatPrediction={onRepeatPrediction}
            />
        );

        expect(onRepeatPrediction).not.toHaveBeenCalled();
    });

    test('다시 예측 버튼은 복원 객체로 한 번 호출하고 저장값을 삭제한다', () => {
        const onRepeatPrediction = jest.fn();
        const sampleInput = {
            origin: '서울역',
            destination: '광화문',
            travelMode: 'WALK',
            directMinutes: null,
            requiredBikeCount: 2,
        };
        savePendingPrediction(sampleInput);

        render(
            <LoginPage
                initialStatus={LOGIN_STATUS.SUCCESS}
                onRepeatPrediction={onRepeatPrediction}
            />
        );

        const predictButton = screen.getByRole('button', { name: /다시 예측/i });
        fireEvent.click(predictButton);
        fireEvent.click(predictButton);

        expect(onRepeatPrediction).toHaveBeenCalledTimes(1);
        expect(onRepeatPrediction).toHaveBeenCalledWith(sampleInput);
        expect(loadPendingPrediction()).toBeNull();
    });

    test('헤더는 제품명과 주요 메뉴를 시맨틱 내비게이션으로 제공한다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.WAITING} />);
        const navigation = screen.getByRole('navigation', { name: '주요 메뉴' });
        expect(navigation).toHaveTextContent('대여 예측');
        expect(navigation).toHaveTextContent('Q&A');
        expect(screen.getByRole('link', { name: '보관함' })).toHaveAttribute('href', '/#archive');
        expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/#alerts');
        expect(screen.getByRole('heading', { name: '로그인하고 더 편리하게 이용하세요' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '로그인하면' })).toBeInTheDocument();
    });
});
