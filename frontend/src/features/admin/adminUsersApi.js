const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "사용자 요청에 실패했습니다."), { status: response.status, code: body.code });
  return body;
}

export function listAdminUsers({ page = 0, size = 20, sort = "displayName,asc", q = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (q.trim()) params.set("q", q.trim());
  return request(`/api/v1/admin/users?${params.toString()}`);
}

export async function changeAdminUserRole(userId, role, reason) {
  const csrf = await request("/api/v1/auth/csrf");
  return request(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify({ role, reason }),
  });
}
