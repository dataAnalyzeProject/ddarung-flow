const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.message || "알림 요청에 실패했습니다."), { status: response.status, code: body.code });
  }
  return response.status === 204 ? null : body;
}

async function mutation(path, method, body) {
  const csrf = await request("/api/v1/auth/csrf");
  return request(path, {
    method,
    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const loadAlerts = () => Promise.all([request("/api/v1/notifications"), request("/api/v1/notification-rules")]);
export const readNotification = (id) => mutation(`/api/v1/notifications/${id}/read`, "POST");
export const readAllNotifications = () => mutation("/api/v1/notifications/read-all", "POST");
export const updateRule = (id, enabled) => mutation(`/api/v1/notification-rules/${id}`, "PATCH", { enabled });
