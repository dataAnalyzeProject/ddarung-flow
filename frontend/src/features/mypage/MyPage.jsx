import { useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { getCurrentUser, logout } from "../login/authApi";
import { BellIcon, FolderIcon, QnaIcon } from "./icons";
import "./MyPage.css";

export default function MyPage({ onNavigate }) {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((auth) => {
        if (cancelled) return;
        if (!auth.authenticated) {
          setAuthState("anonymous");
          return;
        }
        setUser(auth.user);
        setAuthState("authenticated");
      })
      .catch(() => {
        if (!cancelled) setAuthState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      onNavigate?.("main");
    } catch {
      setAuthState("authenticated");
    }
  };

  return (
    <div className="mypage-shell">
      <AppHeader activeRoute="mypage" authState={authState} user={user} onNavigate={onNavigate} onLogout={handleLogout} />
      <main className="mypage-content">
        <div className="mypage-kicker">마이페이지</div>
        <h1 className="mypage-title">내 정보</h1>
        <p className="mypage-subtitle">현재 로그인 계정의 기본 정보와 개인 기능을 확인하세요.</p>

        {authState === "authenticated" && user ? (
          <>
            <div className="mypage-grid">
              <article className="mypage-card">
                <span className="mypage-pill">기본 정보</span>
                <div className="mypage-avatar" aria-hidden="true">
                  {user.displayName ? user.displayName.slice(0, 1) : "따"}
                </div>
                <div className="mypage-name">{user.displayName || "따릉이 사용자"}</div>
                <div className="mypage-table">
                  <div className="mypage-row">
                    <span>표시 이름</span>
                    <b>{user.displayName || "-"}</b>
                  </div>
                  <div className="mypage-row">
                    <span>로그인 제공자</span>
                    <b>{user.provider || "-"}</b>
                  </div>
                </div>
                <div className="mypage-secure">로그인 정보는 안전하게 보호됩니다.</div>
              </article>

              <article className="mypage-card">
                <span className="mypage-pill green">바로가기</span>
                <h2 className="mypage-service-title">내 서비스</h2>
                <button type="button" className="mypage-service-item" onClick={() => onNavigate?.("qna")}>
                  <span className="mypage-svc-icon"><QnaIcon /></span>
                  <span>
                    <strong>내 Q&amp;A</strong>
                    <small>작성한 질문 확인</small>
                  </span>
                  <span className="mypage-chev" aria-hidden="true">›</span>
                </button>
                <button type="button" className="mypage-service-item" onClick={() => onNavigate?.("archive")}>
                  <span className="mypage-svc-icon"><FolderIcon /></span>
                  <span>
                    <strong>보관함·예측 이력</strong>
                    <small>저장 항목과 과거 요청 확인</small>
                  </span>
                  <span className="mypage-chev" aria-hidden="true">›</span>
                </button>
                <button type="button" className="mypage-service-item" onClick={() => onNavigate?.("alerts")}>
                  <span className="mypage-svc-icon"><BellIcon /></span>
                  <span>
                    <strong>알림</strong>
                    <small>새 알림 확인</small>
                  </span>
                  <span className="mypage-chev" aria-hidden="true">›</span>
                </button>
                {user.role === "ADMIN" && <button type="button" className="mypage-service-item" onClick={() => onNavigate?.("admin")}>
                  <span className="mypage-svc-icon" aria-hidden="true">⚙</span>
                  <span>
                    <strong>관리자 콘솔</strong>
                    <small>서비스 운영 관리</small>
                  </span>
                  <span className="mypage-chev" aria-hidden="true">›</span>
                </button>}
              </article>
            </div>

            <div className="mypage-actions">
              <button type="button" className="mypage-btn" onClick={() => onNavigate?.("main")}>
                ← 메인으로
              </button>
              <div className="mypage-info-bar">
                <span className="mypage-info-i" aria-hidden="true">i</span>
                <span>개인 기능은 로그인한 계정에서만 확인할 수 있습니다.</span>
              </div>
              <button type="button" className="mypage-btn danger" disabled={authState === "logging-out"} onClick={handleLogout}>
                {authState === "logging-out" ? "로그아웃 중" : "로그아웃"}
              </button>
            </div>
          </>
        ) : authState === "loading" ? (
          <p className="mypage-notice" role="status">로그인 상태를 확인하는 중입니다…</p>
        ) : (
          <section className="mypage-guest-card">
            <h2>로그인이 필요합니다</h2>
            <p>마이페이지는 로그인한 계정에서만 확인할 수 있습니다.</p>
            <a className="mypage-btn primary" href="/login">로그인하러 가기</a>
          </section>
        )}
      </main>
    </div>
  );
}
