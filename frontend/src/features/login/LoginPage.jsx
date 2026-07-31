import { useState } from 'react';
import './LoginPage.css';
import SocialLoginButton from './components/SocialLoginButton';
import { LOGIN_STATUS, MOCK_USERS, STATUS_MESSAGES } from './data/authDemoData';
import kakaoImg from './components/kakao_login_medium_narrow.png';
import naverImg from './components/NAVER_login_Dark_KR_green_narrow_H48.png';
import googleImg from './components/Theme=Neutral, Show text=Yes, Shape=Square, Platform=Android+Web.png';

export default function LoginPage() {
    const [loginStatus, setLoginStatus] = useState(LOGIN_STATUS.WAITING);
    const [userInfo, setUserInfo] = useState(null);

    // 로그인 시뮬레이션
    const handleLogin = (provider) => {
        setLoginStatus(LOGIN_STATUS.LOADING);

        // 시뮬레이션용 타임아웃 (예시)
        setTimeout(() => {
            setUserInfo(MOCK_USERS[provider]);
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

    // 버튼 비활성화 조건 (로그인 처리 중일 때 중복 클릭 방지)
    const isButtonDisabled = loginStatus === LOGIN_STATUS.LOADING;

    return (
        <div className="login-page-container">
            {/* 1. Header 영역 */}
            <header className="header-area">
                <h1>따릉이 대여 예측 서비스</h1>
                {loginStatus !== LOGIN_STATUS.SUCCESS && loginStatus !== LOGIN_STATUS.LOADING && (
                    <p>예측을 확인하려면 로그인이 필요합니다.</p>
                )}
            </header>

            {/* 2. SocialLoginArea 영역 (로그인 전/실패/취소/로그아웃 완료 상태일 때 표시) */}
            {![LOGIN_STATUS.SUCCESS, LOGIN_STATUS.LOGGING_OUT].includes(loginStatus) && (
                <div className="social-login-area">

                    <SocialLoginButton
                        provider="Kakao"
                        iconUrl={kakaoImg} // <--- import한 변수로 전달!
                        disabled={isButtonDisabled}
                        onClick={() => handleLogin('Kakao')}
                    />
                    <SocialLoginButton
                        provider="Naver"
                        iconUrl={naverImg}
                        disabled={isButtonDisabled}
                        onClick={() => handleLogin('Naver')}
                    />
                    <SocialLoginButton
                        provider="Google"
                        iconUrl={googleImg}
                        disabled={isButtonDisabled}
                        onClick={() => handleLogin('Google')}
                    />
                    <div className="sub-links">
                        <button className="link-btn" disabled={isButtonDisabled}>둘러보기</button>
                    </div>
                </div>

            )}

            {/* 3. StatusArea (상태에 맞는 UI 분기) */}
            <div>
                {loginStatus === LOGIN_STATUS.SUCCESS && (
                    <div className="success-box">
                        <h2>환영합니다.</h2>
                        <p>이름 : {userInfo?.name}</p>
                        <p>로그인 제공자 : {userInfo?.provider}</p>
                        <button onClick={handleLogout}>로그아웃</button>
                    </div>
                )}

                {STATUS_MESSAGES[loginStatus] && (
                    <p className="status-text">{STATUS_MESSAGES[loginStatus].notice}</p>
                )}
            </div>
        </div>
    );
}
