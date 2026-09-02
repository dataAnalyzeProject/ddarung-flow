import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
  updateQuestion,
} from "../../../qna/api/qnaApi.js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

export const SUPPORTED_NOTIFICATION_TYPES = [
  "PLAN_RECHECK",
  "SEARCH_RECHECK",
  "QNA_ANSWERED",
  "PREMIUM_ACTIVE",
  "PREMIUM_EXPIRY",
  "PREMIUM_EXPIRED",
];

const EVENT_META = {
  PLAN_RECHECK: { group: "recheck", label: "계획 재확인", tone: "info" },
  SEARCH_RECHECK: { group: "recheck", label: "검색 재확인", tone: "info" },
  QNA_ANSWERED: { group: "qna", label: "Q&A 답변", tone: "success" },
  PREMIUM_ACTIVE: { group: "premium", label: "Premium 활성", tone: "premium" },
  PREMIUM_EXPIRY: { group: "premium", label: "Premium 안내", tone: "premium" },
  PREMIUM_EXPIRED: { group: "premium", label: "Premium 만료", tone: "warning" },
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body?.message || "요청을 처리하지 못했습니다."), {
      status: response.status,
      code: body?.code,
    });
  }
  return body;
}

async function mutation(path, method, body) {
  const csrf = await request("/api/v1/auth/csrf");
  return request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function mapNotification(notification) {
  const meta = EVENT_META[notification?.notificationType];
  if (!meta) return null;
  return {
    id: notification.id,
    title: notification.title || meta.label,
    message: notification.message || "",
    createdAt: notification.createdAt || null,
    readAt: notification.readAt || null,
    notificationType: notification.notificationType,
    ...meta,
    action: notification.actionRef ? {
      kind: notification.actionType === "RECHECK_SUBSCRIPTION"
        ? "recheck"
        : notification.actionType === "QNA_QUESTION"
          ? "qna"
          : notification.actionType === "PREMIUM_STATUS"
            ? "premium"
            : null,
      ref: notification.actionRef,
    } : notification.actionType === "PREMIUM_STATUS" ? { kind: "premium", ref: null } : null,
  };
}

function recheckBody(kind, target, departureAt) {
  return {
    kind,
    savedJourneyId: kind === "PLAN_RECHECK" ? target.savedJourneyId : null,
    searchInput: kind === "SEARCH_RECHECK" ? target.searchInput : null,
    departureAt,
  };
}

function recheckPlace(place = {}) {
  return {
    providerId: place.providerId,
    displayName: place.displayName,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

function recheckSearchInput(searchInput = {}) {
  return {
    origin: recheckPlace(searchInput.origin),
    destination: recheckPlace(searchInput.destination),
    travelMode: searchInput.travelMode,
    requiredBikeCount: searchInput.requiredBikeCount,
  };
}

export function createConsumerSupportAdapter({
  api = { request, mutation },
  qna = { createQuestion, deleteQuestion, getQuestion, listQuestions, updateQuestion },
} = {}) {
  return {
    listQuestions: (params) => qna.listQuestions(params),
    getQuestion: (id) => qna.getQuestion(id),
    createQuestion: (question) => qna.createQuestion(question),
    updateQuestion: (id, question) => qna.updateQuestion(id, question),
    deleteQuestion: (id) => qna.deleteQuestion(id),
    async loadAlerts() {
      const [notifications, subscriptions] = await Promise.all([
        api.request("/api/v1/notifications"),
        api.request("/api/v1/recheck-subscriptions"),
      ]);
      return {
        notifications: (Array.isArray(notifications) ? notifications : []).map(mapNotification).filter(Boolean),
        subscriptions: Array.isArray(subscriptions) ? subscriptions : [],
      };
    },
    markRead: (id) => api.mutation(`/api/v1/notifications/${encodeURIComponent(id)}/read`, "POST"),
    markAllRead: () => api.mutation("/api/v1/notifications/read-all", "POST"),
    createSearchRecheck: (searchInput, departureAt) => api.mutation(
      "/api/v1/recheck-subscriptions",
      "POST",
      recheckBody("SEARCH_RECHECK", { searchInput: recheckSearchInput(searchInput) }, departureAt),
    ),
    createPlanRecheck: (savedJourneyId, departureAt) => api.mutation(
      "/api/v1/recheck-subscriptions",
      "POST",
      recheckBody("PLAN_RECHECK", { savedJourneyId }, departureAt),
    ),
    cancelRecheck: (publicId) => api.mutation(
      `/api/v1/recheck-subscriptions/${encodeURIComponent(publicId)}`,
      "DELETE",
    ),
    executeRecheck: (publicId) => api.mutation(
      `/api/v1/recheck-subscriptions/${encodeURIComponent(publicId)}/execute`,
      "POST",
    ),
  };
}

export const consumerSupportAdapter = createConsumerSupportAdapter();
