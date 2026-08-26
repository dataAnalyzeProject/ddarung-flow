const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "ModelOps 요청에 실패했습니다."), { status: response.status, code: body.code });
  return body;
}

async function post(path) {
  const csrf = await request("/api/v1/auth/csrf");
  return request(path, { method: "POST", headers: { [csrf.headerName]: csrf.token } });
}

export function listAdminModels() { return request("/api/v1/admin/models"); }
export function validateAdminModel(id) { return post(`/api/v1/admin/models/${id}/validate`); }
export function approveAdminModel(id) { return post(`/api/v1/admin/models/${id}/approve`); }
export function activateAdminModel(id) { return post(`/api/v1/admin/models/${id}/activate`); }
export function rollbackAdminModel() { return post("/api/v1/admin/models/rollback"); }
