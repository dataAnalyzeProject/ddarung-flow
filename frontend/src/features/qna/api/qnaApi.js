const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw Object.assign(new Error(error.message || "Q&A 요청에 실패했습니다."), { status: response.status, code: error.code }); }
  return response.status === 204 ? null : response.json();
};
const mutation = async (path, method, body) => { const csrf = await request("/api/v1/auth/csrf"); return request(path, { method, headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token }, body: body ? JSON.stringify(body) : undefined }); };
export const mapQuestion = (question) => ({ ...question, body: question.body, categoryLabel: ({ USAGE: "서비스 이용", BICYCLE_FAULT: "자전거 고장", STATION: "대여소", ACCOUNT: "계정", LOCATION: "위치", PAYMENT: "결제", OTHER: "기타" })[question.category] || question.category, status: question.status === "PENDING" ? "OPEN" : question.status, answer: question.answers?.[0]?.body || null, authorId: question.isAuthor ? "mine" : "other", createdAt: question.createdAt ? new Date(question.createdAt).toLocaleString("ko-KR") : "" });
export const listQuestions = (params = {}) => request(`/api/v1/qna/questions?${new URLSearchParams(Object.entries(params).filter(([, value]) => value && value !== "ALL")).toString()}`).then(({ items, ...page }) => ({ ...page, items: items.map(mapQuestion) }));
export const getQuestion = (id) => request(`/api/v1/qna/questions/${id}`).then(mapQuestion);
export const createQuestion = (body) => mutation("/api/v1/qna/questions", "POST", body).then(mapQuestion);
export const updateQuestion = (id, body) => mutation(`/api/v1/qna/questions/${id}`, "PATCH", body).then(mapQuestion);
export const deleteQuestion = (id) => mutation(`/api/v1/qna/questions/${id}`, "DELETE");
