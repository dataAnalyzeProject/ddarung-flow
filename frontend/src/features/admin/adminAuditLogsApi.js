const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "감사 로그 요청에 실패했습니다."), { status: response.status, code: body.code });
  return body;
}

export function listAdminAuditLogs({ action = "", result = "", reasonCode = "", from = "", to = "", page = 0, size = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (action.trim()) params.set("action", action.trim());
  if (result) params.set("result", result);
  if (reasonCode.trim()) params.set("reasonCode", reasonCode.trim());
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  return request(`/api/v1/admin/audit-logs?${params.toString()}`);
}
