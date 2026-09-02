import { useEffect, useState } from "react";
import { consumerPersonalAdapter } from "../adapters/personal/consumerPersonalAdapter";
import { ConsumerAppHeader, ConsumerButton, ConsumerContainer, ConsumerIcon, ConsumerR2Theme, StatusBadge } from "../shared";
import "./personal.css";

function subscriptionLabel(subscription) {
  if (!subscription) return "상태 확인 불가";
  return subscription.status === "ACTIVE" ? "Premium 활성" : subscription.status === "EXPIRED" ? "Premium 만료" : "Free";
}

export default function PersonalMyPage({ adapter = consumerPersonalAdapter, onNavigate }) {
  const [profile, setProfile] = useState({ authState: "loading", user: null, subscription: null });
  const [logoutState, setLogoutState] = useState("idle");

  useEffect(() => {
    let cancelled = false;
    adapter.loadMyPage().then((next) => { if (!cancelled) setProfile(next); }).catch(() => { if (!cancelled) setProfile({ authState: "error", user: null, subscription: null }); });
    return () => { cancelled = true; };
  }, [adapter]);

  async function handleLogout() {
    setLogoutState("loading");
    try { await adapter.logout(); onNavigate?.("main"); } catch { setLogoutState("error"); }
  }

  const { authState, subscription, subscriptionError, user } = profile;
  return <ConsumerR2Theme className="cr22-personal"><ConsumerAppHeader authState={authState} onAccount={() => onNavigate?.("mypage")} onLogin={() => onNavigate?.("login")} onNavigate={onNavigate} userName={user?.displayName || user?.name} userTier={subscription?.status === "ACTIVE" ? "premium" : undefined} />
    <main className="cr22-personal__main" id="main-content"><ConsumerContainer><header className="cr22-personal__hero"><div><h1>마이페이지</h1><p>로그인한 계정의 개인 기능과 Premium sandbox 상태를 확인합니다.</p></div></header>
      {authState === "loading" ? <p className="cr22-personal__state" role="status">계정 상태를 확인하는 중입니다…</p> : null}
      {authState === "anonymous" ? <section className="cr22-personal__state" role="alert"><h2>로그인이 필요합니다</h2><ConsumerButton onClick={() => onNavigate?.("login")}>로그인하기</ConsumerButton></section> : null}
      {authState === "error" ? <section className="cr22-personal__state cr22-personal__state--error" role="alert"><h2>계정 상태를 확인하지 못했습니다</h2><p>다시 시도해 주세요.</p></section> : null}
      {authState === "authenticated" && user ? <div className="cr22-personal__sections"><div className="cr22-personal__account-grid"><section className="cr22-personal__section cr22-personal__profile"><div className="cr22-personal__profile-title"><ConsumerIcon name="user" size={20} /><strong>내 프로필</strong></div><div className="cr22-personal__avatar" aria-hidden="true">{(user.displayName || user.name || "따").slice(0, 1)}</div><div className="cr22-personal__section-head"><div><h2>{user.displayName || user.name || "따릉이 사용자"}</h2><p>{user.email || "연결된 계정"}</p></div><StatusBadge>{user.provider || "연결 계정"}</StatusBadge></div><dl className="cr22-personal__profile-rows"><div><dt>로그인 제공자</dt><dd>{user.provider || "확인 불가"}</dd></div><div><dt>로그인 상태</dt><dd>연결됨</dd></div></dl><ConsumerButton variant="secondary" size="sm" disabled>프로필 정보 수정</ConsumerButton></section>
          <section className="cr22-personal__section cr22-personal__premium-card"><div className="cr22-personal__profile-title"><ConsumerIcon name="plan" size={20} /><strong>Premium AI</strong></div><div className="cr22-personal__section-head"><div><h2>{subscriptionLabel(subscription)}</h2><p>AI 기능 접근 상태</p></div><StatusBadge tone={subscription?.status === "ACTIVE" ? "premium" : "neutral"}>{subscription?.status || "UNAVAILABLE"}</StatusBadge></div><div className="cr22-personal__premium-status"><strong>{subscription?.planName || "Premium sandbox"}</strong><span>{subscription?.endsAt ? `${subscription.endsAt}까지` : "자동 갱신 없음"}</span></div><p className="cr22-personal__detail">Premium은 실제 따릉이 이용권이나 상용 결제가 아닌 sandbox 접근 상태입니다.</p>{subscriptionError ? <p className="cr22-personal__notice" role="status">Premium 상태를 지금 확인할 수 없습니다.</p> : null}<div className="cr22-personal__premium-actions"><ConsumerButton size="sm" onClick={() => onNavigate?.("guide")}>라이딩 가이드</ConsumerButton><ConsumerButton variant="secondary" size="sm" onClick={() => onNavigate?.("premium")}>상태 관리</ConsumerButton></div></section></div>
        <section className="cr22-personal__section"><div className="cr22-personal__section-head"><div><h2>내 서비스</h2><p>자주 쓰는 개인 기능으로 바로 이동합니다.</p></div></div><div className="cr22-personal__service-grid"><button type="button" onClick={() => onNavigate?.("qna")}><i><ConsumerIcon name="qna" size={20} /></i><strong>Q&amp;A</strong><span>내 질문과 답변 확인</span><em>›</em></button><button type="button" onClick={() => onNavigate?.("archive")}><i><ConsumerIcon name="plan" size={20} /></i><strong>보관함</strong><span>즐겨찾기와 저장한 계획</span><em>›</em></button><button type="button" onClick={() => onNavigate?.("alerts")}><i><ConsumerIcon name="bell" size={20} /></i><strong>알림</strong><span>재확인과 상태 소식</span><em>›</em></button><button className="is-premium" type="button" onClick={() => onNavigate?.("planner")}><i><ConsumerIcon name="bike" size={20} /></i><strong>AI 플래너</strong><span>전체 일정 만들기</span><em>›</em></button></div></section>
        <div className="cr22-personal__logout"><ConsumerButton variant="tertiary" onClick={() => onNavigate?.("main")}>메인으로</ConsumerButton><ConsumerButton loading={logoutState === "loading"} loadingLabel="로그아웃 중…" variant="tertiary" onClick={handleLogout}>로그아웃</ConsumerButton>{logoutState === "error" ? <p role="alert">로그아웃하지 못했습니다. 다시 시도해 주세요.</p> : null}</div></div> : null}
    </ConsumerContainer></main></ConsumerR2Theme>;
}
