import logo from "../assets/main/ddaragayo-logo.png";
import "./AppHeader.css";

export default function AppHeader({ authContent, onNavigate }) {
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
        {authContent || <a className="app-header-login" aria-label="로그인" href="/login">로그인</a>}
      </div>
    </header>
  );
}
