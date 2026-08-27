const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

export async function getAdminPredictionBatches() {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/prediction-batches`, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "예측 배치 정보를 불러오지 못했습니다."), { status: response.status, code: body.code });
  return body;
}
