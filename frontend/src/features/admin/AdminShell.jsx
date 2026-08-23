import logo from "../../assets/main/ddaragayo-logo.png";
import sidebarBike from "../../assets/main/admin-sidebar-bike-v1.png";
import { adminMenus, roleLabels } from "./adminFixture";
import "./AdminShell.css";

function NavIcon({ id }) {
  const shapes = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><path d="M14 20.5v-5.2M17 20.5v-9M20 20.5v-12" /></>,
    users: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6M18.2 7.2a2.4 2.4 0 0 1 0 4.5M20 15.5c1.3.8 2.1 2.2 2.5 4" /></>,
    export: <><path d="M12 3.5v10M8.2 10.2 12 14l3.8-3.8M5 18.5v2h14v-2" /><rect x="4" y="3.5" width="16" height="17" rx="2" /></>,
    audit: <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
    modelops: <><path d="m12 3.5 7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8L12 3.5Z" /><path d="m4.8 7.9 7.2 4.2 7.2-4.2M12 12.1v8" /></>,
    qna: <><path d="M5 5.5h14v10H9l-4 4v-14Z" /><path d="M8.5 9.5h7M8.5 13h4.5" /></>,
  };
  return <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{shapes[id]}</g></svg>;
}

export default function AdminShell({ activeMenuId, actorRole, onMenu, onAction, children }) {
  const active = adminMenus.find((item) => item.id === activeMenuId) || adminMenus[0];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="관리자 메뉴">
        <div className="admin-brand"><img src={logo} alt="따라가요" /></div>
        <p className="admin-brand-copy">운영 관리자 콘솔</p>
        <nav className="admin-nav">
          {adminMenus.map((item) => <button key={item.id} type="button" className={item.id === activeMenuId ? "is-active" : ""} aria-current={item.id === activeMenuId ? "page" : undefined} onClick={() => onMenu(item.id)}><NavIcon id={item.id} />{item.label}</button>)}
        </nav>
        <div className="admin-sidebar-art"><img src={sidebarBike} alt="" /></div>
        <div className="admin-side-actions"><button type="button" onClick={() => onAction({ type: "return_service" })}>일반 서비스로</button><button type="button" onClick={() => onAction({ type: "logout" })}>로그아웃</button></div>
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
