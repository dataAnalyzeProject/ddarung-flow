const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
async function request(path) { const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" }); const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.message || "모델 성능 요청에 실패했습니다."), { status: response.status, code: body.code }); return body; }
export const getAdminPerformance = () => request("/api/v1/admin/model-performance");
