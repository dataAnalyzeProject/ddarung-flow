import { useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { BikeIcon, TrendIcon } from "./icons";
import { loadAlerts, readAllNotifications, readNotification, updateRule } from "./alertsApi";
import "./AlertsPage.css";

export default function AlertsPage({ authState, user, onNavigate, onBeforeLogin, onLogout }) {
  const [notifications, setNotifications] = useState([]);
  const [rules, setRules] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAlerts().then(([loadedNotifications, loadedRules]) => {
      setNotifications(loadedNotifications);
      setRules(loadedRules);
    }).catch((requestError) => setError(requestError.code || "알림을 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const visibleNotifications = unreadOnly ? notifications.filter((notification) => !notification.readAt) : notifications;
  const markRead = async (id) => {
    try {
      const updated = await readNotification(id);
      setNotifications((current) => current.map((item) => item.id === id ? updated : item));
    } catch (requestError) { setError(requestError.code || "읽음 처리하지 못했습니다."); }
  };
  const markAllRead = async () => {
    try {
      await readAllNotifications();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || "read" })));
    } catch (requestError) { setError(requestError.code || "읽음 처리하지 못했습니다."); }
  };
  const toggleRule = async (rule) => {
    try {
      const updated = await updateRule(rule.id, !rule.enabled);
      setRules((current) => current.map((item) => item.id === rule.id ? updated : item));
    } catch (requestError) { setError(requestError.code || "규칙을 변경하지 못했습니다."); }
  };

  return <div className="alerts-shell">
    <AppHeader activeRoute="alerts" authState={authState} user={user} onNavigate={onNavigate} onBeforeLogin={onBeforeLogin} onLogout={onLogout} />
    <main className="alerts-content">
      <div className="alerts-head"><div><h1 className="alerts-title">알림</h1><p className="alerts-subtitle">저장한 조건과 서비스 안내를 한곳에서 확인하세요.</p></div><div className="alerts-actions"><button type="button" className="alerts-btn" onClick={markAllRead}>모두 읽음</button><button type="button" className="alerts-btn primary" onClick={() => document.getElementById("alerts-rule-card")?.scrollIntoView({ behavior: "smooth" })}>알림 규칙 설정</button></div></div>
      {loading && <p role="status">알림을 불러오는 중입니다.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="alerts-grid">
        <section className="alerts-card alert-list" aria-label="알림 목록"><div className="alert-tabs"><button type="button" className={!unreadOnly ? "active" : ""} onClick={() => setUnreadOnly(false)}>전체</button><button type="button" className={unreadOnly ? "active" : ""} onClick={() => setUnreadOnly(true)}>미읽음 <span className="alerts-count">{unreadCount}</span></button></div><ul className="notification-list">{!loading && !visibleNotifications.length && <li className="notification">표시할 알림이 없습니다.</li>}{visibleNotifications.map((notification) => <li key={notification.id}><button type="button" className="notification" disabled={Boolean(notification.readAt)} onClick={() => markRead(notification.id)} aria-label={`${notification.title} 읽음 처리`}><span className={`dot ${notification.readAt ? "read" : ""}`} /><span className="circle-icon green"><TrendIcon /></span><span className="notification-body"><span className="notification-title">{notification.title}</span><span className="notification-detail">{notification.message}</span></span><span className="notification-side"><span className={`read-pill ${notification.readAt ? "" : "unread"}`}>{notification.readAt ? "읽음" : "미읽음"}</span></span></button></li>)}</ul></section>
        <aside className="alerts-card rule-card" id="alerts-rule-card" aria-label="알림 규칙"><div className="rule-header"><h2>알림 규칙</h2><span className="using">{rules.filter((rule) => rule.enabled).length}개 사용 중</span></div><ul className="rule-list">{rules.map((rule) => <li key={rule.id} className="rule-row"><span className="circle-icon green"><BikeIcon /></span><span className="rule-name">{rule.conditionType}</span><button type="button" className={`switch ${rule.enabled ? "on" : ""}`} role="switch" aria-checked={rule.enabled} aria-label={rule.conditionType} onClick={() => toggleRule(rule)} /></li>)}</ul></aside>
      </div>
    </main>
  </div>;
}
