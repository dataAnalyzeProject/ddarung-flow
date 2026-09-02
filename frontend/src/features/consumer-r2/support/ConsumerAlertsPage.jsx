import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consumerSupportAdapter } from "../adapters/support";
import { ConsumerAppHeader, ConsumerButton, ConsumerContainer, ConsumerR2Theme, StatusBadge } from "../shared";
import reminderBell from "../../../assets/consumer-r2/alerts/cr22-alert-reminder-bell-v1.webp";
import RecheckOptInDialog from "./RecheckOptInDialog";
import "./support.css";

const systemNow = () => new Date();
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

export function formatEventDate(value) {
  if (!value) return "시각 정보 없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 정보 없음" : dateFormatter.format(date);
}

function subscriptionLabel(subscription) {
  if (subscription.kind === "PLAN_RECHECK") return "저장한 AI 계획";
  const origin = subscription.searchInput?.origin?.displayName || "출발지";
  const destination = subscription.searchInput?.destination?.displayName || "목적지";
  return `${origin} → ${destination}`;
}

function subscriptionStatus(status) {
  return ({ ACTIVE: "알림 대기", DELIVERED: "재확인 가능", CANCELLED: "취소됨", FAILED: "알림 실패" })[status] || "상태 확인 필요";
}

export default function ConsumerAlertsPage({
  adapter = consumerSupportAdapter,
  authState = "authenticated",
  now = systemNow,
  onCurrentData,
  onNavigate,
  savedJourneyId,
  searchInput,
  user,
}) {
  const [requestState, setRequestState] = useState("loading");
  const [notifications, setNotifications] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [dialogKind, setDialogKind] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const loadRequestIdRef = useRef(0);
  const sessionRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    if (authState !== "authenticated") {
      setRequestState(authState === "loading" ? "loading" : "auth-required");
      return;
    }
    setRequestState("loading");
    try {
      const result = await adapter.loadAlerts();
      if (requestId !== loadRequestIdRef.current) return;
      setNotifications(result.notifications);
      setSubscriptions(result.subscriptions);
      setRequestState("success");
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      setRequestState(error.status === 401 ? "auth-required" : "error");
    }
  }, [adapter, authState]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (authState === "authenticated") return;
    loadRequestIdRef.current += 1;
    sessionRequestIdRef.current += 1;
    setNotifications([]);
    setSubscriptions([]);
    setDialogKind(null);
    setBusyKey("");
    setNotice("");
  }, [authState]);

  const visibleNotifications = useMemo(() => notifications.filter((notification) => {
    if (filter === "UNREAD") return !notification.readAt;
    if (filter === "RECHECK") return notification.group === "recheck";
    if (filter === "QNA") return notification.group === "qna";
    if (filter === "PREMIUM") return notification.group === "premium";
    return true;
  }), [filter, notifications]);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  async function readNotification(notification) {
    if (notification.readAt) return;
    const sessionId = sessionRequestIdRef.current;
    setBusyKey(`read-${notification.id}`);
    try {
      const updated = await adapter.markRead(notification.id);
      if (sessionId !== sessionRequestIdRef.current) return;
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: updated?.readAt || new Date().toISOString() } : item));
    } catch {
      if (sessionId !== sessionRequestIdRef.current) return;
      setNotice("알림을 읽음 처리하지 못했습니다.");
    } finally {
      if (sessionId === sessionRequestIdRef.current) setBusyKey("");
    }
  }

  async function readAll() {
    const sessionId = sessionRequestIdRef.current;
    setBusyKey("read-all");
    setNotice("");
    try {
      await adapter.markAllRead();
      if (sessionId !== sessionRequestIdRef.current) return;
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
      setNotice("모든 알림을 읽음 처리했습니다.");
    } catch {
      if (sessionId !== sessionRequestIdRef.current) return;
      setNotice("전체 알림을 읽음 처리하지 못했습니다.");
    } finally {
      if (sessionId === sessionRequestIdRef.current) setBusyKey("");
    }
  }

  async function createRecheck(departureAt) {
    const sessionId = sessionRequestIdRef.current;
    setBusyKey("create-recheck");
    setNotice("");
    try {
      const created = dialogKind === "SEARCH_RECHECK"
        ? await adapter.createSearchRecheck(searchInput, departureAt)
        : await adapter.createPlanRecheck(savedJourneyId, departureAt);
      if (sessionId !== sessionRequestIdRef.current) return;
      setSubscriptions((current) => [created, ...current.filter((item) => item.publicId !== created.publicId)]);
      setDialogKind(null);
      setNotice("출발 15분 전 재확인 알림을 신청했습니다.");
    } catch (error) {
      if (sessionId !== sessionRequestIdRef.current) return;
      setNotice(error.status === 401 ? "로그인이 필요합니다." : error.code === "PREMIUM_REQUIRED" ? "계획 재확인은 Premium 활성 계정에서 사용할 수 있습니다." : "재확인 알림을 신청하지 못했습니다.");
    } finally {
      if (sessionId === sessionRequestIdRef.current) setBusyKey("");
    }
  }

  async function cancelRecheck(subscription) {
    const sessionId = sessionRequestIdRef.current;
    setBusyKey(`cancel-${subscription.publicId}`);
    setNotice("");
    try {
      await adapter.cancelRecheck(subscription.publicId);
      if (sessionId !== sessionRequestIdRef.current) return;
      setSubscriptions((current) => current.map((item) => item.publicId === subscription.publicId ? { ...item, status: "CANCELLED" } : item));
      setNotice("재확인 알림을 취소했습니다.");
    } catch {
      if (sessionId !== sessionRequestIdRef.current) return;
      setNotice("재확인 알림을 취소하지 못했습니다.");
    } finally {
      if (sessionId === sessionRequestIdRef.current) setBusyKey("");
    }
  }

  async function executeRecheck(publicId) {
    const sessionId = sessionRequestIdRef.current;
    setBusyKey(`execute-${publicId}`);
    setNotice("");
    try {
      const currentResult = await adapter.executeRecheck(publicId);
      if (sessionId !== sessionRequestIdRef.current) return;
      onCurrentData?.(currentResult);
      setNotice("현재 데이터로 재확인했습니다.");
    } catch (error) {
      if (sessionId !== sessionRequestIdRef.current) return;
      setNotice(error.code === "PREMIUM_REQUIRED" ? "현재 재확인은 Premium 활성 계정에서 사용할 수 있습니다." : error.status === 409 ? "아직 재확인할 시간이 아닙니다." : "현재 데이터를 다시 확인하지 못했습니다.");
    } finally {
      if (sessionId === sessionRequestIdRef.current) setBusyKey("");
    }
  }

  function eventAction(notification) {
    if (notification.action?.kind === "recheck") return <ConsumerButton loading={busyKey === `execute-${notification.action.ref}`} loadingLabel="현재 정보 확인 중…" onClick={() => executeRecheck(notification.action.ref)} size="sm">현재 정보 다시 확인</ConsumerButton>;
    if (notification.action?.kind === "qna") return <ConsumerButton onClick={() => onNavigate?.("qna", { questionId: notification.action.ref })} size="sm" variant="secondary">답변 보기</ConsumerButton>;
    if (notification.group === "premium") return <ConsumerButton onClick={() => onNavigate?.("premium")} size="sm" variant="secondary">Premium 상태 보기</ConsumerButton>;
    return null;
  }

  const effectiveRequestState = authState === "authenticated" ? requestState : authState === "loading" ? "loading" : "auth-required";
  const content = effectiveRequestState === "loading"
    ? <p className="cr22-support__state" role="status">알림을 불러오는 중입니다…</p>
    : effectiveRequestState === "auth-required"
      ? <section className="cr22-support__state" role="alert"><h2>로그인이 필요합니다</h2><p>내 알림과 재확인 신청은 로그인 후 확인할 수 있습니다.</p><ConsumerButton onClick={() => onNavigate?.("login")}>로그인하기</ConsumerButton></section>
      : effectiveRequestState === "error"
        ? <section className="cr22-support__state cr22-support__state--error" role="alert"><h2>알림을 불러오지 못했습니다</h2><p>잠시 후 다시 시도해 주세요.</p><ConsumerButton onClick={load}>다시 시도</ConsumerButton></section>
        : visibleNotifications.length
          ? <div className="cr22-support__event-list">{visibleNotifications.map((notification) => <article className={`cr22-support__event${notification.readAt ? " is-read" : " is-unread"}`} key={notification.id}><button aria-label={`${notification.title} 알림 읽음 처리`} className="cr22-support__event-main" disabled={Boolean(notification.readAt) || busyKey === `read-${notification.id}`} onClick={() => readNotification(notification)} type="button"><span className={`cr22-support__event-mark is-${notification.group}`} aria-hidden="true">{notification.group === "qna" ? "Q" : notification.group === "premium" ? "P" : "↻"}</span><span><span className="cr22-support__meta"><StatusBadge tone={notification.tone}>{notification.label}</StatusBadge>{!notification.readAt ? <i>새 알림</i> : null}</span><strong>{notification.title}</strong><small>{formatEventDate(notification.createdAt)}</small><span className="cr22-support__event-message">{notification.message}</span></span></button>{eventAction(notification)}</article>)}</div>
          : <section className="cr22-support__state"><h2>{notifications.length ? "선택한 알림이 없습니다" : "새 알림이 없습니다"}</h2><p>재확인, Q&amp;A 답변, Premium 상태 변경이 생기면 이곳에 표시됩니다.</p></section>;

  return (
    <ConsumerR2Theme className="cr22-support">
      <ConsumerAppHeader activeItem="alerts" authState={authState} hasUnreadNotifications={unreadCount > 0} onAccount={() => onNavigate?.("mypage")} onLogin={() => onNavigate?.("login")} onNavigate={onNavigate} onNotifications={() => {}} userName={user?.displayName || user?.name} userTier={user?.tier} />
      <main className="cr22-support__main" id="main-content">
        <ConsumerContainer>
          <header className="cr22-support__hero"><div><p className="cr22-support__eyebrow">NOTIFICATIONS</p><h1>알림</h1><p>출발 전 재확인과 Q&amp;A 답변, Premium 상태 소식을 확인하세요.</p></div>{unreadCount ? <ConsumerButton loading={busyKey === "read-all"} loadingLabel="처리 중…" onClick={readAll} variant="secondary">모두 읽음</ConsumerButton> : null}</header>
          {notice ? <p className="cr22-support__notice" role="status">{notice}</p> : null}
          {effectiveRequestState === "success" ? <section className="cr22-support__recheck-panel" aria-labelledby="recheck-title"><img alt="출발 전 재확인 알림을 상징하는 벨 일러스트" className="cr22-support__recheck-art" height="400" src={reminderBell} width="600" /><div><p className="cr22-support__eyebrow">BEFORE YOU RIDE</p><h2 id="recheck-title">출발 전 재확인</h2><p>저장된 입력으로 출발 15분 전에 알려 드리고, 실행할 때 현재 데이터를 새로 확인합니다.</p></div><div className="cr22-support__recheck-actions">{searchInput ? <ConsumerButton onClick={() => setDialogKind("SEARCH_RECHECK")}>현재 검색 알림 받기</ConsumerButton> : null}{savedJourneyId ? <ConsumerButton onClick={() => setDialogKind("PLAN_RECHECK")} variant="premium">저장한 계획 알림 받기</ConsumerButton> : null}</div>{subscriptions.length ? <div className="cr22-support__subscription-list">{subscriptions.map((subscription) => <article key={subscription.publicId}><div><strong>{subscriptionLabel(subscription)}</strong><span>{formatEventDate(subscription.departureAt)} 출발</span></div><StatusBadge tone={subscription.status === "ACTIVE" ? "info" : subscription.status === "DELIVERED" ? "success" : "neutral"}>{subscriptionStatus(subscription.status)}</StatusBadge>{subscription.status === "ACTIVE" ? <ConsumerButton loading={busyKey === `cancel-${subscription.publicId}`} loadingLabel="취소 중…" onClick={() => cancelRecheck(subscription)} size="sm" variant="ghost">알림 취소</ConsumerButton> : null}{subscription.status === "DELIVERED" ? <ConsumerButton loading={busyKey === `execute-${subscription.publicId}`} loadingLabel="확인 중…" onClick={() => executeRecheck(subscription.publicId)} size="sm">현재 정보 확인</ConsumerButton> : null}</article>)}</div> : <p className="cr22-support__recheck-empty">신청한 재확인 알림이 없습니다.</p>}</section> : null}
          <section className="cr22-support__alerts-panel" aria-labelledby="alerts-list-title"><div className="cr22-support__section-head"><div><h2 id="alerts-list-title">알림 내역</h2><p>지원되는 서비스 이벤트만 표시합니다.</p></div><span>{unreadCount}개 안 읽음</span></div><div aria-label="알림 필터" className="cr22-support__filter-chips">{[["ALL", "전체"], ["UNREAD", "안 읽음"], ["RECHECK", "재확인"], ["QNA", "Q&A"], ["PREMIUM", "Premium"]].map(([value, label]) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{label}</button>)}</div>{content}</section>
        </ConsumerContainer>
      </main>
      <RecheckOptInDialog busy={busyKey === "create-recheck"} kind={dialogKind || "SEARCH_RECHECK"} now={now} onClose={() => setDialogKind(null)} onConfirm={createRecheck} open={authState === "authenticated" && Boolean(dialogKind)} />
    </ConsumerR2Theme>
  );
}
