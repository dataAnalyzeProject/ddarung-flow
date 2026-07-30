import { useState } from 'react';
import './LoginPage.css';
import SocialLoginButton from './components/SocialLoginButton';

// 상태 정의
const LOGIN_STATUS = {
    WAITING: 'WAITING',
    LOADING: 'LOADING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    LOGGED_OUT: 'LOGGED_OUT',
    LOGGING_OUT: 'LOGGING_OUT',
};

export default function LoginPage() {
    const [loginStatus, setLoginStatus] = useState(LOGIN_STATUS.WAITING);
    const [userInfo, setUserInfo] = useState(null);

    // 로그인 시뮬레이션
    const handleLogin = (provider) => {
        setLoginStatus(LOGIN_STATUS.LOADING);

        // 시뮬레이션용 타임아웃 (예시)
        setTimeout(() => {
            setUserInfo({ name: '홍길동', provider });
            setLoginStatus(LOGIN_STATUS.SUCCESS);
        }, 1500);
    };

    // 로그아웃 시뮬레이션
    const handleLogout = () => {
        setLoginStatus(LOGIN_STATUS.LOGGING_OUT);
        setTimeout(() => {
            setUserInfo(null);
            setLoginStatus(LOGIN_STATUS.LOGGED_OUT);
        }, 1000);
    };

    const resetToLogin = () => {
        setLoginStatus(LOGIN_STATUS.WAITING);
    };

    // 버튼 비활성화 조건 (로그인 처리 중일 때 중복 클릭 방지)
    const isButtonDisabled = loginStatus === LOGIN_STATUS.LOADING;

    return (
        <div className="login-page-container">
            {/* 1. Header 영역 */}
            <header className="header-area">
                <h1>따릉이 거리 예측 서비스</h1>
                {loginStatus === LOGIN_STATUS.WAITING && (
                    <p>예측을 확인하려면 로그인이 필요합니다.</p>
                )}
            </header>

            {/* 2. SocialLoginArea 영역 (로그인 전/실패/취소/로그아웃 완료 상태일 때 표시) */}
            {![LOGIN_STATUS.SUCCESS, LOGIN_STATUS.LOGGING_OUT].includes(loginStatus) && (
                <div className="social-login-area">
                    <SocialLoginButton
                        provider="Kakao"
                        disabled={isButtonDisabled}
                        onClick={() => handleLogin('Kakao')}
                    />
                    <SocialLoginButton
                        provider="Naver"
                        disabled={isButtonDisabled}
                        onClick={() => handleLogin('Naver')}
                    />
                    <SocialLoginButton
                        provider="Google"
                        disabled={isButtonDisabled}
                        onClick={() => handleLogin('Google')}
                    />
                    <div className="sub-links">
                        <button className="link-btn" disabled={isButtonDisabled}>이메일로 로그인</button>
                        <span className="divider">|</span>
                        <button className="link-btn" disabled={isButtonDisabled}>회원가입</button>
                        <span className="divider">|</span>
                        <button className="link-btn" disabled={isButtonDisabled}>둘러보기</button>
                    </div>
                </div>
            )}

            {/* 3. StatusArea (상태에 맞는 UI 분기) */}
            <div className="status-area">
                {loginStatus === LOGIN_STATUS.WAITING && (
                    <p className="status-text">상태 : 로그인 전</p>
                )}

                {loginStatus === LOGIN_STATUS.LOADING && (
                    <p className="status-text">로그인 처리 중입니다...</p>
                )}

                {loginStatus === LOGIN_STATUS.SUCCESS && (
                    <div className="success-box">
                        <h2>환영합니다.</h2>
                        <p>이름 : {userInfo?.name}</p>
                        <p>로그인 제공자 : {userInfo?.provider}</p>
                        <button onClick={handleLogout}>로그아웃</button>
                    </div>
                )}

                {loginStatus === LOGIN_STATUS.FAILED && (
                    <div className="error-box">
                        <p>로그인에 실패했습니다.</p>
                        <p>다시 시도해주세요.</p>
                        <button onClick={resetToLogin}>다시 시도</button>
                    </div>
                )}

                {loginStatus === LOGIN_STATUS.CANCELLED && (
                    <div className="cancel-box">
                        <p>로그인이 취소되었습니다.</p>
                        <button onClick={resetToLogin}>다시 로그인</button>
                    </div>
                )}

                {loginStatus === LOGIN_STATUS.EXPIRED && (
                    <div className="expired-box">
                        <p>세션이 만료되었습니다.</p>
                        <p>다시 로그인해주세요.</p>
                        <button onClick={resetToLogin}>로그인</button>
                    </div>
                )}

                {loginStatus === LOGIN_STATUS.LOGGING_OUT && (
                    <p className="status-text">로그아웃 중입니다...</p>
                )}

                {loginStatus === LOGIN_STATUS.LOGGED_OUT && (
                    <div className="logout-box">
                        <p>로그아웃되었습니다.</p>
                        <button onClick={resetToLogin}>다시 로그인</button>
                    </div>
                )}
            </div>
        </div>
    );
}
