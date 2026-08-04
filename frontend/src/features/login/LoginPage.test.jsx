import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';
import { LOGIN_STATUS } from './data/authDemoData';
import { savePendingPrediction, loadPendingPrediction } from './loginStorage';
import { getCurrentUser, startSocialLogin } from './authApi';
jest.mock('./authApi', () => ({
    getCurrentUser: jest.fn(() => Promise.resolve({ authenticated: false, user: null })),
    logout: jest.fn(() => Promise.resolve()),
    startSocialLogin: jest.fn(),
}));
describe('LoginPage 핵심 4개 테스트', () => {
    beforeEach(() => {
        getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
    });

    // 1. Google·Kakao·Naver 버튼이 보임
    test('1. Google, Kakao, Naver 소셜 로그인 버튼 3개가 모두 표시된다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.WAITING} />);
        expect(screen.getByTitle('Kakao 로그인')).toBeInTheDocument();
        expect(screen.getByTitle('Naver 로그인')).toBeInTheDocument();
        expect(screen.getByTitle('Google 로그인')).toBeInTheDocument();
    });
    // 2. 처리 중에는 버튼을 다시 누를 수 없음
    test('2. LOADING 처리 중에는 버튼이 비활성화되어 중복 클릭할 수 없다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.LOADING} />);
        const kakaoBtn = screen.getByTitle('Kakao 로그인');
        expect(kakaoBtn).toBeDisabled();
    });
    test('소셜 로그인 버튼은 선택한 공급자의 OAuth 로그인을 시작한다', async () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.WAITING} />);
        fireEvent.click(screen.getByTitle('Kakao 로그인'));
        expect(startSocialLogin).toHaveBeenCalledWith('Kakao');
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
    // 3. 실패 안내 뒤 다시 시도할 수 있음
    test('3. FAILED 상태일 때 실패 안내 메시지가 표시되고 소셜 버튼으로 다시 시도할 수 있다', () => {
        render(<LoginPage initialStatus={LOGIN_STATUS.FAILED} />);
        expect(screen.getByText(/로그인에 실패했습니다/i)).toBeInTheDocument();
        expect(screen.getByTitle('Kakao 로그인')).not.toBeDisabled();
    });
    // 4. 성공하면 사용자 안내가 보이고 로그아웃할 수 있음 (+ 입력 보존 정상 사례 1개 확인)
    test('4. SUCCESS 상태에서 입력값 보존 확인 및 안내 표시', async () => {
        const sampleInput = {
            origin: '서울역',
            destination: '광화문',
            travelMode: '도보',
            directMinutes: null
        };
        savePendingPrediction(sampleInput);
        // 🎯 저장 후 다시 잘 읽히는지 직접 검증하는 1줄 추가
        expect(loadPendingPrediction()).toEqual(sampleInput);

        render(<LoginPage initialStatus={LOGIN_STATUS.SUCCESS} mockOutcome="success" />);
        await waitFor(() => {
            expect(screen.getByText(/출발지: 서울역/i)).toBeInTheDocument();
            expect(screen.getByText(/목적지: 광화문/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/입력값을 확인한 후 다시 예측해 주세요/i)).toBeInTheDocument();
        // 4번 테스트 맨 아래에 로그아웃 클릭 이벤트 검증 추가
        const logoutBtn = screen.getByText(/로그아웃/i);
        fireEvent.click(logoutBtn);
        // 클릭 후 로그아웃 완료 메시지가 뜨는지 확인
        expect(screen.getByText(/로그아웃 되었습니다/i)).toBeInTheDocument();
    });
});
