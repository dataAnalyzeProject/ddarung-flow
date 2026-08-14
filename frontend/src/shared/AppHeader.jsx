import logo from "../assets/main/ddaragayo-logo.png";
import "./AppHeader.css";

export default function AppHeader({ authState = "anonymous", onBeforeLogin, onLogout, onNavigate, user }) {
  const isAuthenticated = authState === "authenticated" || authState === "logging-out";

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <img src={logo} alt="따라가요" />
        <span aria-hidden="true" />
        <strong>따릉이 도착 대여 예측</strong>
      </div>
      <nav aria-label="주요 메뉴" className="app-header-menu">
        <button aria-current="page" type="button">대여 예측</button>
        <button type="button" onClick={() => onNavigate?.("qna")}>Q&amp;A</button>
        <button type="button">보관함</button>
        <button type="button">알림</button>
      </nav>
      <div className="app-header-auth">
        {isAuthenticated ? (
          <>
            <span className="app-header-user">{user ? `${user.displayName} · ${user.provider}` : ""}</span>
            <button aria-label="로그아웃" type="button" disabled={authState === "logging-out"} onClick={onLogout}>
              {authState === "logging-out" ? "로그아웃 중" : `${user?.displayName || "사용자"} · 로그아웃`}
            </button>
          </>
        ) : authState === "loading" ? (
          <button type="button" disabled>확인 중</button>
        ) : (
          <a className="app-header-login" aria-label="로그인" href="/login" onClick={onBeforeLogin}>로그인</a>
        )}
      </div>
    </header>
  );
}
