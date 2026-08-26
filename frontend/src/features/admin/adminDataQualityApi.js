const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

export async function getAdminDataQuality() {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/data-quality`, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "데이터 품질 요청에 실패했습니다."), { status: response.status, code: body.code });
  return body;
}
