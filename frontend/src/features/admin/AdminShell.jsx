import logo from "../../assets/main/ddaragayo-logo.png";
import bike from "../../assets/main/hero-bike.png";
import { adminMenus, roleLabels } from "./adminFixture";
import "./AdminShell.css";

export default function AdminShell({ activeMenuId, actorRole, onMenu, onAction, children }) {
  const active = adminMenus.find((item) => item.id === activeMenuId) || adminMenus[0];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="관리자 메뉴">
        <div className="admin-brand"><img src={logo} alt="따라가요" /><span className="admin-brand-divider" /><strong>관리자 콘솔</strong></div>
        <p className="admin-brand-copy">따라가요 운영 관리</p>
        <nav className="admin-nav">
          {adminMenus.map((item) => <button key={item.id} type="button" className={item.id === activeMenuId ? "is-active" : ""} aria-current={item.id === activeMenuId ? "page" : undefined} onClick={() => onMenu(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
        </nav>
        <div className="admin-sidebar-art"><img src={bike} alt="" /></div>
        <div className="admin-side-actions"><button type="button" onClick={() => onAction({ type: "return_service" })}>↗ 일반 서비스로</button><button type="button" onClick={() => onAction({ type: "logout" })}>↪ 로그아웃</button></div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <p>관리자 <span>/</span> <strong>{active.label}</strong></p>
          <div className="admin-top-meta"><span className="admin-reference">● fixture 기준 2026.08.21 21:30</span><span className="admin-role">{roleLabels[actorRole] || "권한 없음"}</span></div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
