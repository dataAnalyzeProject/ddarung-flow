import { useState, useEffect } from 'react';
import './LoginPage.css';
import SocialLoginButton from './components/SocialLoginButton';
import { LOGIN_STATUS, MOCK_USERS } from './data/authDemoData';
import { savePendingPrediction } from './loginStorage';
import kakaoImg from './components/kakao_login_large_wide.png';
import naverImg from './components/NAVER_login_Dark_KR_green_center_H56.png';
import googleImg from './components/019fb652-80d1-7692-b81b-73a811ebf1d9.png';


// 1. 매개변수(Props 3개)를 받아오도록 함수 선언부 변경 (기본값 세팅 포함)
export default function LoginPage({
    initialStatus = LOGIN_STATUS.WAITING,
    mockOutcome = 'success',
    initialPredictionInput = null
}) {
    // 2. 고정된 WAITING 대신 전달받은 initialStatus로 초기 상태 세팅
    const [loginStatus, setLoginStatus] = useState(initialStatus);
    const [userInfo, setUserInfo] = useState(null);

    // 🎯 3-1. initialPredictionInput이 전달되면 즉시 sessionStorage에 4개 값 저장
    useEffect(() => {
        if (initialPredictionInput) {
            savePendingPrediction(initialPredictionInput);
        }
    }, [initialPredictionInput]);

    // 로그인 시뮬레이션
    const handleLogin = (provider) => {
        // 1. 먼저 로딩 상태로 변경
        setLoginStatus(LOGIN_STATUS.LOADING);
        // 2. 300ms 타임아웃 후 mockOutcome 결과에 따라 분기 처리
        setTimeout(() => {
            // mockOutcome이 'failed'일 경우
            if (mockOutcome === 'failed') {
                setLoginStatus(LOGIN_STATUS.FAILED);
                return;
            }
            // mockOutcome이 'cancelled'일 경우
            if (mockOutcome === 'cancelled') {
                setLoginStatus(LOGIN_STATUS.CANCELLED);
                return;
            }
            // 기본값 / 'success'일 경우 로그인 성공 처리
            setUserInfo(MOCK_USERS[provider] || { name: '테스트유저', provider });
            setLoginStatus(LOGIN_STATUS.SUCCESS);
        }, 300); // <--- 명세에 맞춰 1500ms에서 300ms로 대기시간 변경
    };
    // 로그아웃 시뮬레이션
    const handleLogout = () => {
        setUserInfo(null);
        setLoginStatus(LOGIN_STATUS.LOGGED_OUT);
    };

    // 버튼 비활성화 조건
    const isButtonDisabled = loginStatus === LOGIN_STATUS.LOADING;

    return (
        <div className="login-page-container">
            {/* [수정] 화면 맨 위에 좌우로 뻗는 흰색 상단 헤더 바 */}
            <header className="top-navbar">
                <div className="top-logo-bar">
                    <span className="logo-badge-box">SEOUL BIKE</span>
                    <span className="logo-text">따릉이 도착 대여 예측</span>
                </div>
            </header>
            {/* 1. Header 및 카드 영역 */}
            <div className="login-card">
                <header className="header-area">
                    <p className="brand-tag">SEOUL BIKE PREDICT</p>

                    <h1>따릉이 도착 대여 예측 서비스</h1>
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
                            <h2>입력값을 확인한 후 다시 예측해 주세요.</h2>
                            <p>이름 : {userInfo?.name}</p>
                            <p>로그인 제공자 : {userInfo?.provider}</p>
                            <button onClick={handleLogout}>로그아웃</button>
                        </div>
                    )}
                    {loginStatus === LOGIN_STATUS.LOADING && (
                        <div className="loading-box">
                            <h2>로그인 처리 중입니다.</h2>
                        </div>
                    )}
                    {loginStatus === LOGIN_STATUS.FAILED && (
                        <div className="error-box">
                            <h2>로그인에 실패했습니다.</h2>
                            <p> 아이디 또는 비밀번호를 확인한 후 다시 시도해주세요.</p>
                        </div>
                    )}
                    {loginStatus === LOGIN_STATUS.CANCELLED && (
                        <div className="cancel-box">
                            <h2>로그인 취소</h2>
                            <p> 로그인 처리 중 사용자가 로그인을 취소했습니다.</p>
                        </div>
                    )}
                    {loginStatus === LOGIN_STATUS.EXPIRED && (
                        <div className="expired-box">
                            <h2>로그인 만료</h2>
                            <p>로그인 세션이 만료되어 자동으로 로그아웃 처리되었습니다.</p>
                        </div>
                    )}
                    {loginStatus === LOGIN_STATUS.LOGGED_OUT && (
                        <div className="logout-box">
                            <h2>로그아웃 되었습니다.</h2>
                            <p>로그아웃 처리되었습니다. 다시 로그인이 필요한 경우 소셜 로그인을 선택해주세요.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
