const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
const request = async (path, options = {}) => { const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options }); if (!response.ok) throw Object.assign(new Error("관리자 Q&A 요청에 실패했습니다."), { status: response.status }); return response.status === 204 ? null : response.json(); };
const mutate = async (path, body) => { const csrf = await request("/api/v1/auth/csrf"); return request(path, { method: "POST", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token }, body: body ? JSON.stringify(body) : undefined }); };
export const listAdminQuestions = () => request("/api/v1/admin/qna/questions");
export const answerQuestion = (id, body) => mutate(`/api/v1/admin/qna/questions/${id}/answer`, { body });
export const hideQuestion = (id) => mutate(`/api/v1/admin/qna/questions/${id}/hide`);
