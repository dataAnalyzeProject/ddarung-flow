import brandLogo from "../../../assets/main/ddaragayo-logo.png";
import ConsumerIcon from "./ConsumerIcon.jsx";
import "../styles/index.css";

export const CONSUMER_NAV_ITEMS = [
  { id: "home", label: "홈", href: "/" },
  { id: "ride", label: "라이딩" },
  { id: "planner", label: "AI 플래너", premium: true },
  { id: "archive", label: "보관함", href: "#archive" },
  { id: "qna", label: "Q&A", href: "#qna" },
];

function navigate(event, item, onNavigate) {
  if (!onNavigate) return;
  event.preventDefault();
  onNavigate(item.id);
}

export default function ConsumerAppHeader({
  activeItem = "home",
  authState = "anonymous",
  hasUnreadNotifications = false,
  navItems = CONSUMER_NAV_ITEMS,
  onAccount,
  onLogin,
  onNavigate,
  onNotifications,
  skipTarget = "#main-content",
  userName,
  userTier,
}) {
  const authenticated = authState === "authenticated";

  return (
    <header className="cr22-header">
      <a className="cr22-header__skip-link" href={skipTarget} onClick={(event) => {
        const target = document.getElementById(skipTarget.slice(1));
        if (!target) return;
        event.preventDefault();
        target.tabIndex = -1;
        target.focus();
        target.scrollIntoView?.({ block: "start" });
      }}>본문 바로가기</a>
      <a className="cr22-header__brand" href="/" aria-label="따라가요 홈" onClick={(event) => navigate(event, CONSUMER_NAV_ITEMS[0], onNavigate)}>
        <img src={brandLogo} alt="따라가요" width="895" height="220" fetchpriority="high" translate="no" />
      </a>

      <nav className="cr22-header__nav" aria-label="주요 메뉴">
        {navItems.map((item) => {
          const content = <><span>{item.label}</span>{item.premium ? <span className="cr22-header__premium">PREMIUM</span> : null}</>;
          const commonProps = {
            className: "cr22-header__nav-link",
            "aria-current": activeItem === item.id ? "page" : undefined,
          };

          return item.href ? (
            <a {...commonProps} href={item.href} key={item.id} onClick={(event) => navigate(event, item, onNavigate)}>{content}</a>
          ) : (
            <button {...commonProps} type="button" disabled={!onNavigate} key={item.id} onClick={() => onNavigate?.(item.id)}>{content}</button>
          );
        })}
      </nav>

      <div className="cr22-header__actions">
        <button className="cr22-header__icon-button" type="button" aria-label={hasUnreadNotifications ? "새 알림 보기" : "알림 보기"} onClick={onNotifications || (() => onNavigate ? onNavigate('alerts') : window.location.assign('/#alerts'))}>
          <ConsumerIcon name="bell" />
          {hasUnreadNotifications ? <span className="cr22-header__notification-dot" aria-hidden="true" /> : null}
        </button>
        {authState === "loading" ? (
          <span className="cr22-header__account" role="status">확인 중</span>
        ) : authenticated ? (
          <a className="cr22-header__account" href="#mypage" onClick={(event) => {
            if (!onAccount && !onNavigate) return;
            event.preventDefault();
            if (onAccount) onAccount(); else onNavigate("mypage");
          }}>
            <ConsumerIcon name="user" />
            <span className="cr22-header__user-name">{userName || "내 계정"}</span>
            {userTier === "premium" ? <span className="cr22-header__premium">PREMIUM</span> : null}
            <ConsumerIcon name="chevronDown" size={18} />
          </a>
        ) : (
          <a className="cr22-header__account" href="/login" onClick={(event) => {
            if (!onLogin) return;
            event.preventDefault();
            onLogin();
          }}>
            <ConsumerIcon name="user" />
            <span>로그인</span>
          </a>
        )}
      </div>
    </header>
  );
}
