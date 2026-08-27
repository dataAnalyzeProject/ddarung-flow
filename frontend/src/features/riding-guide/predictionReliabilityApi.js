const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

export async function fetchPredictionReliability({ horizonMinutes, requiredBikeCount, stationId, probability }) {
  const params = new URLSearchParams({
    horizonMinutes: String(horizonMinutes),
    requiredBikeCount: String(requiredBikeCount),
    probability: String(probability),
  });
  if (stationId) params.set("stationId", stationId);

  const response = await fetch(`${API_BASE_URL}/api/v1/prediction-reliability?${params}`, {
    credentials: "include",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "예측 신뢰도를 불러오지 못했습니다."), { status: response.status, code: body.code });
  return body;
}
