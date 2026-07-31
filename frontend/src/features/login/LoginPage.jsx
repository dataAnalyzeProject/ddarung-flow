import { useState, useEffect } from 'react';
import './LoginPage.css';
import SocialLoginButton from './components/SocialLoginButton';
import { LOGIN_STATUS } from './data/authDemoData';
import kakaoImg from './components/kakao_login_large_wide.png';
import naverImg from './components/NAVER_login_Dark_KR_green_center_H56.png';
import googleImg from './components/019fb652-80d1-7692-b81b-73a811ebf1d9.png';

const BACKEND_URL = 'http://localhost:8080';

export default function LoginPage() {
    const [loginStatus, setLoginStatus] = useState(LOGIN_STATUS.WAITING);
    const [userInfo, setUserInfo] = useState(null);

    // 백엔드 세션 로그인 상태 확인
    useEffect(() => {
        fetch(`${BACKEND_URL}/api/auth/me`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.loggedIn) {
                    setUserInfo({
                        name: data.name || '사용자',
                        provider: data.provider || '소셜로그인',
                        email: data.email
                    });
                    setLoginStatus(LOGIN_STATUS.SUCCESS);
                } else {
                    setLoginStatus(LOGIN_STATUS.WAITING);
                }
            })
            .catch(() => {
                setLoginStatus(LOGIN_STATUS.WAITING);
            });
    }, []);

    // 백엔드 소셜 로그인 엔드포인트로 이동
    const handleLogin = (provider) => {
        setLoginStatus(LOGIN_STATUS.LOADING);
        const providerLower = provider.toLowerCase();
        window.location.href = `${BACKEND_URL}/oauth2/authorization/${providerLower}`;
    };

    // 백엔드 로그아웃 API 호출
    const handleLogout = () => {
        setLoginStatus(LOGIN_STATUS.LOGGING_OUT);
        fetch(`${BACKEND_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        })
            .then(() => {
                setUserInfo(null);
                setLoginStatus(LOGIN_STATUS.LOGGED_OUT);
            })
            .catch(() => {
                setUserInfo(null);
                setLoginStatus(LOGIN_STATUS.LOGGED_OUT);
            });
    };

    // 버튼 비활성화 조건
    const isButtonDisabled = loginStatus === LOGIN_STATUS.LOADING;

    return (
        <div className="login-page-container">
            {/* 1. Header 영역 */}
            <div className="login-card">
                <header className="header-area">
                    <h1>따릉이 대여 예측 서비스</h1>
                    {loginStatus !== LOGIN_STATUS.SUCCESS && loginStatus !== LOGIN_STATUS.LOADING && (
                        <p>예측을 확인하려면 로그인이 필요합니다.</p>
                    )}
                </header>

                {/* 2. SocialLoginArea 영역 */}
                {![LOGIN_STATUS.SUCCESS, LOGIN_STATUS.LOGGING_OUT].includes(loginStatus) && (
                    <div className="social-login-area">
                        <SocialLoginButton
                            provider="Kakao"
                            iconUrl={kakaoImg}
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
                    </div>
                )}

                {/* 3. StatusArea */}
                <div>
                    {loginStatus === LOGIN_STATUS.SUCCESS && (
                        <div className="success-box">
                            <h2>환영합니다.</h2>
                            <p>이름 : {userInfo?.name}</p>
                            <p>로그인 제공자 : {userInfo?.provider}</p>
                            <button onClick={handleLogout}>로그아웃</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
