const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "Export 요청에 실패했습니다."), { status: response.status, code: body.code });
  return body;
}

export function listAdminExports() { return request("/api/v1/admin/exports"); }

export async function createAdminExport(payload) {
  const csrf = await request("/api/v1/auth/csrf");
  return request("/api/v1/admin/exports", { method: "POST", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token }, body: JSON.stringify(payload) });
}

export async function downloadAdminExport(exportId) {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/exports/${exportId}/download`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || "다운로드에 실패했습니다."), { status: response.status, code: body.code });
  }
  return response.blob();
}
