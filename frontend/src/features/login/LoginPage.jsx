import { useEffect, useState } from "react";
import "./LoginPage.css";
import { LOGIN_STATUS, MOCK_USERS } from "./data/authDemoData";
import { getCurrentUser, logout, startSocialLogin } from "./authApi";
import { clearPendingPrediction, loadPendingPrediction, savePendingPrediction } from "./loginStorage";
import logo from "../../assets/main/ddaragayo-logo.png";

const providers = [
  { id: "Google", label: "Google로 계속하기", mark: "G" },
  { id: "Naver", label: "네이버로 계속하기", mark: "N" },
  { id: "Kakao", label: "카카오로 계속하기", mark: "K" },
];

function LoginIcon({ name }) {
  const paths = {
    bookmark: "M7 4h10v16l-5-3-5 3V4Z",
    bell: "M6 16h12l-2-3V9a4 4 0 0 0-8 0v4l-2 3Zm4 3h4",
    history: "M4 7v5h5M5 11a7 7 0 1 0 2-5M12 8v4l3 2",
    arrow: "M9 5l7 7-7 7",
  };
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d={paths[name]} />
    </svg>
  );
}

function LoginBicycle() {
  const spokes = [0, 30, 60, 90, 120, 150];
  return (
    <svg className="login-bike" aria-hidden="true" focusable="false" viewBox="0 0 420 280">
      <defs>
        <linearGradient id="loginBikeFrame" x1="0" x2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dcecf1" />
        </linearGradient>
      </defs>
      <ellipse cx="210" cy="263" rx="181" ry="11" fill="#173855" opacity=".16" />
      {[102, 320].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="205" r="67" fill="#101820" />
          <circle cx={cx} cy="205" r="57" fill="#eff8fb" stroke="#82c900" strokeWidth="7" />
          <circle cx={cx} cy="205" r="4" fill="#132238" />
          {spokes.map((angle) => (
            <line key={angle} x1={cx} y1="205" x2={cx + Math.cos(angle * Math.PI / 180) * 52} y2={205 + Math.sin(angle * Math.PI / 180) * 52} stroke="#9aabb6" strokeWidth="2" />
          ))}
        </g>
      ))}
      <g fill="none" stroke="#15263a" strokeLinecap="round" strokeLinejoin="round">
        <path d="M102 205 158 158 231 205 260 103 320 205 231 205 158 158 260 103" strokeWidth="15" />
        <path d="M102 205 158 158 231 205 260 103 320 205 231 205 158 158 260 103" stroke="url(#loginBikeFrame)" strokeWidth="10" />
        <path d="M102 205 148 95 158 158" strokeWidth="13" />
        <path d="M102 205 148 95 158 158" stroke="#edf5f5" strokeWidth="8" />
        <path d="M145 98 135 61 157 42M134 60l-25 3" strokeWidth="8" />
      </g>
      <path d="M246 96h38c7 0 9 9 2 12h-43Z" fill="#121b25" />
      <circle cx="231" cy="205" r="14" fill="#f7fbfc" stroke="#15263a" strokeWidth="5" />
      <path d="m231 205 31 24m-31-24-25-22" fill="none" stroke="#15263a" strokeWidth="5" strokeLinecap="round" />
      <g stroke="#15263a" strokeWidth="4" strokeLinejoin="round">
        <path d="M72 91h78l-9 62H82Z" fill="#dcecf0" />
        <path d="M86 91v62m18-62v62m19-62v62" fill="none" strokeWidth="2.5" />
        <path d="M72 110h75m-71 20h68" fill="none" strokeWidth="2.5" />
      </g>
      <path d="M250 118h30" stroke="#78bf17" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function LoginStatusPanel({ loginStatus, userInfo, predictionData, isPredicted, onRepeat, onLogout }) {
  if (loginStatus === LOGIN_STATUS.SUCCESS) {
    return (
      <section className="login-success-panel" aria-label="로그인 결과">
        {userInfo && <p className="login-welcome"><strong>{userInfo.name}</strong>님 환영합니다. ({userInfo.provider} 로그인)</p>}
        <h2>로그인 전에 입력한 내용</h2>
        <dl>
          <div><dt>출발지</dt><dd>{predictionData?.origin || "-"}</dd></div>
          <div><dt>목적지</dt><dd>{predictionData?.destination || "-"}</dd></div>
          <div><dt>이동수단</dt><dd>{predictionData?.travelMode || "-"}</dd></div>
          <div><dt>예상시간</dt><dd>{predictionData?.directMinutes !== null && predictionData?.directMinutes !== undefined ? `${predictionData.directMinutes}분` : "이동수단으로 계산"}</dd></div>
          <div><dt>필요 자전거</dt><dd>{predictionData?.requiredBikeCount ?? 1}대</dd></div>
        </dl>
        <p className="login-confirm-copy">입력값을 확인한 후 다시 예측해 주세요.</p>
        <div className="login-result-actions">
          <button className="predict-btn" type="button" onClick={onRepeat} disabled={isPredicted}>다시 예측</button>
          <button className="logout-btn" type="button" onClick={onLogout}>로그아웃</button>
        </div>
      </section>
    );
  }

  const statusContent = {
    [LOGIN_STATUS.LOADING]: ["로그인 처리 중입니다.", "소셜 인증 화면으로 안전하게 연결하고 있어요."],
    [LOGIN_STATUS.FAILED]: ["로그인에 실패했습니다.", "소셜 로그인 연결을 확인한 후 다시 시도해주세요."],
    [LOGIN_STATUS.CANCELLED]: ["로그인 취소", "로그인 처리 중 사용자가 로그인을 취소했습니다."],
    [LOGIN_STATUS.LOGGING_OUT]: ["로그아웃 처리 중입니다.", "세션 정보를 안전하게 정리하고 있어요."],
    [LOGIN_STATUS.EXPIRED]: ["로그인 만료", "로그인 세션이 만료되어 자동으로 로그아웃 처리되었습니다."],
    [LOGIN_STATUS.LOGGED_OUT]: ["로그아웃 되었습니다.", "로그아웃 처리되었습니다. 다시 로그인이 필요한 경우 소셜 로그인을 선택해주세요."],
  }[loginStatus];

  if (!statusContent) return null;
  return (
    <section className={`login-state-alert ${loginStatus.toLowerCase()}`} role={loginStatus === LOGIN_STATUS.FAILED ? "alert" : "status"}>
      <strong>{statusContent[0]}</strong>
      <span>{statusContent[1]}</span>
    </section>
  );
}

export default function LoginPage({ initialStatus, mockOutcome, initialPredictionInput = null, onRepeatPrediction }) {
  const [loginStatus, setLoginStatus] = useState(initialStatus || LOGIN_STATUS.LOADING);
  const [userInfo, setUserInfo] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [isPredicted, setIsPredicted] = useState(false);

  useEffect(() => {
    if (initialPredictionInput) savePendingPrediction(initialPredictionInput);
    setPredictionData(loadPendingPrediction());
    if (initialStatus) return;

    const loginResult = new URLSearchParams(window.location.search).get("login");
    if (loginResult === "failed") {
      setLoginStatus(LOGIN_STATUS.FAILED);
      return;
    }
    if (loginResult === "cancelled") {
      setLoginStatus(LOGIN_STATUS.CANCELLED);
      return;
    }
    if (loginResult === "expired") {
      setLoginStatus(LOGIN_STATUS.EXPIRED);
      return;
    }

    getCurrentUser()
      .then((auth) => {
        if (auth.authenticated) {
          setUserInfo({ name: auth.user.displayName, provider: auth.user.provider });
          setLoginStatus(LOGIN_STATUS.SUCCESS);
          return;
        }
        setLoginStatus(LOGIN_STATUS.WAITING);
      })
      .catch(() => setLoginStatus(LOGIN_STATUS.FAILED));
  }, [initialPredictionInput, initialStatus]);

  useEffect(() => {
    const handlePageShow = (event) => {
      if (!event.persisted) return;
      setLoginStatus((currentStatus) => (
        currentStatus === LOGIN_STATUS.LOADING ? LOGIN_STATUS.WAITING : currentStatus
      ));
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleRepeatPredict = () => {
    if (isPredicted) return;
    if (typeof onRepeatPrediction === "function") {
      setIsPredicted(true);
      onRepeatPrediction(predictionData);
      clearPendingPrediction();
    }
  };

  const handleLogin = (provider) => {
    setLoginStatus(LOGIN_STATUS.LOADING);
    if (mockOutcome) {
      window.setTimeout(() => {
        if (mockOutcome === "failed") return setLoginStatus(LOGIN_STATUS.FAILED);
        if (mockOutcome === "cancelled") return setLoginStatus(LOGIN_STATUS.CANCELLED);
        setUserInfo(MOCK_USERS[provider] || { name: "테스트유저", provider });
        setLoginStatus(LOGIN_STATUS.SUCCESS);
      }, 300);
      return;
    }
    startSocialLogin(provider);
  };

  const handleLogout = async () => {
    if (mockOutcome) {
      setUserInfo(null);
      setLoginStatus(LOGIN_STATUS.LOGGED_OUT);
      return;
    }
    setLoginStatus(LOGIN_STATUS.LOGGING_OUT);
    try {
      await logout();
      setUserInfo(null);
      setLoginStatus(LOGIN_STATUS.LOGGED_OUT);
    } catch {
      setLoginStatus(LOGIN_STATUS.FAILED);
    }
  };

  const isButtonDisabled = loginStatus === LOGIN_STATUS.LOADING;
  const showLoginChoices = ![LOGIN_STATUS.SUCCESS, LOGIN_STATUS.LOGGING_OUT].includes(loginStatus);

  return (
    <main className="login-page-container">
      <header className="login-navbar">
        <a className="login-brand" href="/" aria-label="따라가요 대여 예측 홈">
          <img src={logo} alt="따라가요" />
          <span aria-hidden="true" />
          <strong>따릉이 도착 대여 예측</strong>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="/">대여 예측</a>
          <a href="/#qna">Q&amp;A</a>
          <a href="/#saved">보관함</a>
          <a href="/#notifications">알림</a>
        </nav>
      </header>

      <section className="login-scenic-main" aria-label="로그인 안내">
        <div className="login-sky" aria-hidden="true">
          <span className="login-cloud cloud-one" /><span className="login-cloud cloud-two" /><span className="login-cloud cloud-three" />
          <div className="login-city city-left">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
          <div className="login-city city-right">{Array.from({ length: 11 }, (_, index) => <i key={index} />)}</div>
          <span className="login-hill" /><span className="login-tower" /><span className="login-bridge" /><span className="login-river" />
          <LoginBicycle />
        </div>

        <div className={`login-layout ${loginStatus === LOGIN_STATUS.SUCCESS ? "has-success" : ""}`}>
          <section className="login-card" aria-labelledby="login-title">
            <div className="login-mini-mark" aria-hidden="true"><i /><i /><i /><b /><b /></div>
            <h1 id="login-title">로그인하고 더 편리하게 이용하세요</h1>
            <p className="login-card-description">즐겨찾는 목적지와 알림 설정을 저장할 수 있어요.</p>

            <LoginStatusPanel
              loginStatus={loginStatus}
              userInfo={userInfo}
              predictionData={predictionData}
              isPredicted={isPredicted}
              onRepeat={handleRepeatPredict}
              onLogout={handleLogout}
            />

            {showLoginChoices && (
              <div className="social-login-area" aria-label="소셜 로그인 선택">
                {providers.map((provider) => (
                  <button
                    className={`provider-login provider-${provider.id.toLowerCase()}`}
                    disabled={isButtonDisabled}
                    key={provider.id}
                    onClick={() => handleLogin(provider.id)}
                    title={`${provider.id} 로그인`}
                    type="button"
                  >
                    <span className="provider-mark" aria-hidden="true">{provider.mark}</span>
                    {provider.label}
                  </button>
                ))}
              </div>
            )}

            {showLoginChoices && (
              <>
                <div className="login-divider"><span>또는</span></div>
                <a className="login-without" href="/">로그인 없이 대여 예측하기 <LoginIcon name="arrow" /></a>
                <p className="login-legal">로그인 시 서비스 <span>이용약관</span> 및 <span>개인정보 처리방침</span>에 동의하게 됩니다.</p>
              </>
            )}

            <footer className="login-help">도움이 필요하신가요? <a href="/#qna">Q&amp;A 보기 <LoginIcon name="arrow" /></a></footer>
          </section>

          <aside className="login-benefits" aria-labelledby="benefit-title">
            <h2 id="benefit-title">로그인하면</h2>
            <ul>
              <li><span><LoginIcon name="bookmark" /></span><p><strong>즐겨찾는 목적지 저장</strong><small>자주 가는 곳을 저장하고 빠르게 확인</small></p></li>
              <li><span><LoginIcon name="bell" /></span><p><strong>대여 가능성 알림</strong><small>선택한 시간과 장소의 알림 받기</small></p></li>
              <li><span><LoginIcon name="history" /></span><p><strong>최근 예측 다시 보기</strong><small>이전 예측 결과를 언제든 확인</small></p></li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
