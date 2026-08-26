const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.message || "보관함 요청에 실패했습니다."), { status: response.status, code: body.code });
  }
  return response.status === 204 ? null : body;
}

async function mutation(path, method) {
  const csrf = await request("/api/v1/auth/csrf");
  return request(path, { method, headers: { [csrf.headerName]: csrf.token } });
}

export function loadArchive() {
  return Promise.all([
    request("/api/v1/favorites"),
    request("/api/v1/saved-routes"),
    request("/api/v1/prediction-histories"),
  ]);
}

export const removeFavorite = (id) => mutation(`/api/v1/favorites/${id}`, "DELETE");
export const removeSavedRoute = (id) => mutation(`/api/v1/saved-routes/${id}`, "DELETE");
export const removePredictionHistory = (id) => mutation(`/api/v1/prediction-histories/${id}`, "DELETE");
