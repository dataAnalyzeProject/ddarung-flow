import { useEffect, useState } from "react";
import googleLoginLogo from "../../login/components/019fb652-80d1-7692-b81b-73a811ebf1d9.png";
import kakaoLoginLogo from "../../login/components/kakao_login_large_wide.png";
import naverLoginLogo from "../../login/components/NAVER_login_Dark_KR_green_center_H56.png";
import mobilityStrip from "../../../assets/consumer-r2/shared/cr22-shared-mobility-strip-v1.webp";
import {
  AUTH_PRESENTATION_STATE,
  consumerAuthAdapter,
} from "../adapters/auth/index.js";
import {
  ConsumerAppHeader,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
} from "../shared/index.js";
import "./entry.css";

const PROVIDERS = [
  { id: "Google", label: "Google로 계속하기", image: googleLoginLogo, width: 736, height: 112 },
  { id: "Naver", label: "네이버로 계속하기", image: naverLoginLogo, width: 1472, height: 224 },
  { id: "Kakao", label: "카카오로 계속하기", image: kakaoLoginLogo, width: 600, height: 90 },
];

const STATUS_COPY = {
  [AUTH_PRESENTATION_STATE.LOADING]: ["로그인 처리 중입니다", "소셜 인증 화면으로 안전하게 연결하고 있어요."],
  [AUTH_PRESENTATION_STATE.FAILED]: ["로그인에 실패했습니다", "연결 상태를 확인한 뒤 원하는 로그인 방법으로 다시 시도해 주세요."],
  [AUTH_PRESENTATION_STATE.CANCELLED]: ["로그인이 취소되었습니다", "인증을 완료하지 않았습니다. 준비되면 다시 선택해 주세요."],
  [AUTH_PRESENTATION_STATE.EXPIRED]: ["세션이 만료되었습니다", "계속 이용하려면 다시 로그인해 주세요."],
  [AUTH_PRESENTATION_STATE.LOGGING_OUT]: ["로그아웃 처리 중입니다", "세션 정보를 안전하게 정리하고 있어요."],
  [AUTH_PRESENTATION_STATE.LOGGED_OUT]: ["로그아웃되었습니다", "필요할 때 소셜 로그인으로 다시 시작할 수 있어요."],
};

function formatPendingValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "저장된 입력 없음";
  return `${value}${suffix}`;
}

function LoginNotice({ state }) {
  const copy = STATUS_COPY[state];
  if (!copy) return null;
  const isFailure = state === AUTH_PRESENTATION_STATE.FAILED;

  return (
    <div className={`cr22-login__notice cr22-login__notice--${state.toLowerCase()}`} role={isFailure ? "alert" : "status"} aria-live={isFailure ? "assertive" : "polite"}>
      {state === AUTH_PRESENTATION_STATE.LOADING || state === AUTH_PRESENTATION_STATE.LOGGING_OUT
        ? <span className="cr22-login__spinner" aria-hidden="true" />
        : <ConsumerIcon name={isFailure ? "retry" : "info"} />}
      <p><strong>{copy[0]}</strong><span>{copy[1]}</span></p>
    </div>
  );
}

function PendingPrediction({ prediction }) {
  if (!prediction) {
    return <p className="cr22-login__empty-pending">로그인 전에 저장한 대여 예측 입력이 없습니다.</p>;
  }

  return (
    <dl className="cr22-login__pending-list">
      <div><dt>출발지</dt><dd>{formatPendingValue(prediction.origin)}</dd></div>
      <div><dt>목적지</dt><dd>{formatPendingValue(prediction.destination)}</dd></div>
      <div><dt>이동수단</dt><dd>{formatPendingValue(prediction.travelMode)}</dd></div>
      <div><dt>예상시간</dt><dd>{prediction.directMinutes == null ? "이동수단으로 계산" : formatPendingValue(prediction.directMinutes, "분")}</dd></div>
      <div><dt>필요 자전거</dt><dd>{formatPendingValue(prediction.requiredBikeCount, "대")}</dd></div>
    </dl>
  );
}

export default function LoginPage({
  adapter = consumerAuthAdapter,
  initialStatus,
  onRepeatPrediction,
}) {
  const [loginStatus, setLoginStatus] = useState(initialStatus || AUTH_PRESENTATION_STATE.LOADING);
  const [user, setUser] = useState(null);
  const [pendingPrediction, setPendingPrediction] = useState(() => adapter.loadPendingPrediction());
  const [repeatStarted, setRepeatStarted] = useState(false);

  useEffect(() => {
    setPendingPrediction(adapter.loadPendingPrediction());
    if (initialStatus) return undefined;

    const returnState = adapter.resolveLoginReturnState(window.location.search);
    if (returnState) {
      setLoginStatus(returnState);
      return undefined;
    }

    let cancelled = false;
    adapter.checkSession()
      .then((auth) => {
        if (cancelled) return;
        if (auth.authenticated) {
          setUser(auth.user);
          setLoginStatus(AUTH_PRESENTATION_STATE.SUCCESS);
          return;
        }
        setLoginStatus(AUTH_PRESENTATION_STATE.WAITING);
      })
      .catch(() => {
        if (!cancelled) setLoginStatus(AUTH_PRESENTATION_STATE.WAITING);
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, initialStatus]);

  useEffect(() => {
    const handlePageShow = (event) => {
      if (!event.persisted) return;
      setLoginStatus((current) => (
        current === AUTH_PRESENTATION_STATE.LOADING
          ? AUTH_PRESENTATION_STATE.WAITING
          : current
      ));
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const beginLogin = (provider) => {
    setLoginStatus(AUTH_PRESENTATION_STATE.LOADING);
    adapter.startSocialLogin(provider);
  };

  const handleLogout = async () => {
    setLoginStatus(AUTH_PRESENTATION_STATE.LOGGING_OUT);
    try {
      await adapter.logout();
      setUser(null);
      setLoginStatus(AUTH_PRESENTATION_STATE.LOGGED_OUT);
    } catch {
      setLoginStatus(AUTH_PRESENTATION_STATE.FAILED);
    }
  };

  const repeatPrediction = () => {
    if (repeatStarted || typeof onRepeatPrediction !== "function") return;
    setRepeatStarted(true);
    onRepeatPrediction(pendingPrediction);
    adapter.clearPendingPrediction();
  };

  const authenticated = loginStatus === AUTH_PRESENTATION_STATE.SUCCESS;
  const busy = [AUTH_PRESENTATION_STATE.LOADING, AUTH_PRESENTATION_STATE.LOGGING_OUT].includes(loginStatus);
  const showProviders = !authenticated && loginStatus !== AUTH_PRESENTATION_STATE.LOGGING_OUT;
  const userName = user?.displayName || user?.name;

  return (
    <ConsumerR2Theme className="cr22-entry cr22-login">
      <ConsumerAppHeader
        activeItem=""
        authState={authenticated ? "authenticated" : busy ? "loading" : "anonymous"}
        userName={userName}
      />
      <main id="main-content" className="cr22-login__main">
        <ConsumerContainer>
          <div className="cr22-login__intro">
            <h1>로그인하고 더 편리하게 이용하세요</h1>
            <p>예측 입력을 이어서 확인하고, 자주 찾는 대여소와 알림을 내 계정에 연결할 수 있어요.</p>
          </div>

          <div className={`cr22-login__layout${authenticated ? " cr22-login__layout--success" : ""}`}>
            <section className="cr22-login__panel" aria-labelledby="cr22-login-panel-title">
              <div className="cr22-login__panel-heading">
                <span className="cr22-login__panel-icon" aria-hidden="true"><ConsumerIcon name="user" /></span>
                <div>
                  <h2 id="cr22-login-panel-title">{authenticated ? `${userName || "사용자"}님, 환영합니다` : "소셜 계정으로 로그인"}</h2>
                  <p>{authenticated ? "로그인 전에 입력한 내용을 그대로 이어갈 수 있어요." : "사용 중인 계정을 선택해 주세요."}</p>
                </div>
              </div>

              <LoginNotice state={loginStatus} />

              {authenticated ? (
                <div className="cr22-login__success" aria-label="로그인 결과">
                  <h3>로그인 전에 입력한 내용</h3>
                  <PendingPrediction prediction={pendingPrediction} />
                  <div className="cr22-login__success-actions">
                    {typeof onRepeatPrediction === "function" ? (
                      <button className="cr22-login__continue" type="button" onClick={repeatPrediction} disabled={repeatStarted}>
                        입력 이어서 예측하기 <ConsumerIcon name="arrowRight" />
                      </button>
                    ) : (
                      <a className="cr22-login__continue" href={pendingPrediction ? "/?login=success" : "/"}>
                        {pendingPrediction ? "입력 이어서 예측하기" : "대여 예측으로 이동"} <ConsumerIcon name="arrowRight" />
                      </a>
                    )}
                    <button className="cr22-login__logout" type="button" onClick={handleLogout}>로그아웃</button>
                  </div>
                </div>
              ) : null}

              {showProviders ? (
                <div className="cr22-login__providers" aria-label="소셜 로그인 선택">
                  {PROVIDERS.map((provider) => (
                    <button
                      className={`cr22-login__provider cr22-login__provider--${provider.id.toLowerCase()}`}
                      type="button"
                      key={provider.id}
                      aria-label={provider.label}
                      title={`${provider.id} 로그인`}
                      disabled={busy}
                      onClick={() => beginLogin(provider.id)}
                    >
                      <img
                        src={provider.image}
                        alt=""
                        aria-hidden="true"
                        width={provider.width}
                        height={provider.height}
                      />
                    </button>
                  ))}
                </div>
              ) : null}

              <p className="cr22-login__help">로그인에 문제가 있나요? <a href="/#qna">Q&amp;A에서 도움받기</a></p>
            </section>

            <aside className="cr22-login__benefits" aria-labelledby="cr22-login-benefits-title">
              <h2 id="cr22-login-benefits-title">로그인하면 이어지는 기능</h2>
              <ul>
                <li><ConsumerIcon name="mapPin" /><span><strong>자주 찾는 대여소</strong><small>즐겨찾는 장소를 빠르게 다시 확인해요.</small></span></li>
                <li><ConsumerIcon name="bell" /><span><strong>대여 가능성 알림</strong><small>선택한 장소와 시간의 알림을 받아요.</small></span></li>
                <li><ConsumerIcon name="retry" /><span><strong>최근 예측 이어보기</strong><small>로그인 전에 입력한 조건도 잃지 않아요.</small></span></li>
              </ul>
            </aside>
          </div>
        </ConsumerContainer>

        <figure className="cr22-login__mobility-strip">
          <img
            src={mobilityStrip}
            alt=""
            aria-hidden="true"
            width="1600"
            height="533"
            loading="lazy"
          />
        </figure>
      </main>
    </ConsumerR2Theme>
  );
}
