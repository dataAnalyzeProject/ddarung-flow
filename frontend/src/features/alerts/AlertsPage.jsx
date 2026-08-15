import { useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { notificationRulesFixture, notificationsFixture } from "./data/notificationsFixture";
import { alertKindIcon, BikeIcon, TrendIcon } from "./icons";
import "./AlertsPage.css";

export default function AlertsPage({ authState, user, onNavigate, onBeforeLogin, onLogout }) {
  const [notifications, setNotifications] = useState(notificationsFixture);
  const [rules, setRules] = useState(notificationRulesFixture);

  const unreadCount = notifications.filter((notification) => notification.unread).length;

  const markRead = (id) => {
    setNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, unread: false } : notification))
    );
  };

  const markAllRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })));
  };

  const toggleRule = (id) => {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, on: !rule.on } : rule)));
  };

  return (
    <div className="alerts-shell">
      <AppHeader
        activeRoute="alerts"
        authState={authState}
        user={user}
        onNavigate={onNavigate}
        onBeforeLogin={onBeforeLogin}
        onLogout={onLogout}
      />
      <main className="alerts-content">
        <div className="alerts-head">
          <div>
            <h1 className="alerts-title">알림</h1>
            <p className="alerts-subtitle">저장한 조건과 서비스 안내를 한곳에서 확인하세요.</p>
          </div>
          <div className="alerts-actions">
            <button type="button" className="alerts-btn" onClick={markAllRead}>
              모두 읽음
            </button>
            <button type="button" className="alerts-btn primary" onClick={() => document.getElementById("alerts-rule-card")?.scrollIntoView({ behavior: "smooth" })}>
              알림 규칙 설정
            </button>
          </div>
        </div>

        <div className="alerts-grid">
          <section className="alerts-card alert-list" aria-label="알림 목록">
            <div className="alert-tabs">
              <button type="button" className="active">전체</button>
              <button type="button">
                미읽음 <span className="alerts-count">{unreadCount}</span>
              </button>
            </div>
            <ul className="notification-list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className="notification"
                    disabled={!notification.unread}
                    onClick={() => markRead(notification.id)}
                    aria-label={`${notification.title} 읽음 처리`}
                  >
                    <span className={`dot ${notification.unread ? "" : "read"}`} aria-hidden="true" />
                    <span className={`circle-icon ${notification.kind === "trend" ? "green" : ""}`}>
                      {alertKindIcon(notification.kind)}
                    </span>
                    <span className="notification-body">
                      <span className="notification-title">{notification.title}</span>
                      <span className="notification-detail">{notification.detail}</span>
                    </span>
                    <span className="notification-side">
                      {notification.time} · <span className="linkish">{notification.action}</span>
                      <br />
                      <span className={`read-pill ${notification.unread ? "unread" : ""}`}>
                        {notification.unread ? "미읽음" : "읽음"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <aside className="alerts-card rule-card" id="alerts-rule-card" aria-label="알림 규칙">
            <div className="rule-header">
              <h2>알림 규칙</h2>
              <span className="using">{rules.filter((rule) => rule.on).length}개 사용 중</span>
            </div>
            <ul className="rule-list">
              {rules.map((rule, index) => (
                <li key={rule.id} className="rule-row">
                  <span className="circle-icon green">{index === 0 ? <TrendIcon /> : <BikeIcon />}</span>
                  <span className="rule-name">{rule.name}</span>
                  <button
                    type="button"
                    className={`switch ${rule.on ? "on" : ""}`}
                    role="switch"
                    aria-checked={rule.on}
                    aria-label={rule.name}
                    onClick={() => toggleRule(rule.id)}
                  />
                </li>
              ))}
            </ul>
            <button type="button" className="rule-manage">
              규칙 관리
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
