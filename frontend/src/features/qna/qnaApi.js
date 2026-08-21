import { categoryLabelFor } from "./data/qnaOptions.js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
const QUESTIONS_PATH = "/api/v1/qna/questions";

export class QnaApiError extends Error {
  constructor(message, { code = "QNA_API_ERROR", status = 0 } = {}) {
    super(message);
    this.name = "QnaApiError";
    this.code = code;
    this.status = status;
  }
}

function formatCreatedAt(value) {
  if (!value) return "작성 시각 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeQuestion(question) {
  return {
    ...question,
    categoryLabel: categoryLabelFor(question.category),
    authorId: question.isAuthor ? "current-user" : null,
    createdAt: formatCreatedAt(question.createdAt),
    answer: question.answer ?? null,
  };
}

async function parseResponse(response) {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }

  let errorBody = {};
  try {
    errorBody = await response.json();
  } catch {
    // Keep the stable fallback when the server returns an empty/non-JSON error.
  }

  throw new QnaApiError(
    errorBody.message || (response.status === 401 ? "로그인이 필요한 서비스입니다." : "Q&A 정보를 불러오지 못했습니다."),
    { code: errorBody.code, status: response.status }
  );
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });
  return parseResponse(response);
}

async function getCsrfHeader() {
  const csrf = await request("/api/v1/auth/csrf");
  if (!csrf?.headerName || !csrf?.token) {
    throw new QnaApiError("보안 토큰을 확인하지 못했습니다.", { code: "QNA_CSRF_ERROR" });
  }
  return { [csrf.headerName]: csrf.token };
}

export async function fetchQuestions({ scope = "PUBLIC", category = "ALL", status = "ALL", query = "", page = 1, size = 10, signal } = {}) {
  const params = new URLSearchParams({ scope, page: String(page), size: String(size) });
  if (category !== "ALL") params.set("category", category);
  if (status !== "ALL") params.set("status", status);
  if (query) params.set("query", query);

  const response = await request(`${QUESTIONS_PATH}?${params}`, { signal });
  return {
    ...response,
    items: (response.items || []).map(normalizeQuestion),
  };
}

export async function fetchQuestion(questionId, { signal } = {}) {
  const response = await request(`${QUESTIONS_PATH}/${encodeURIComponent(questionId)}`, { signal });
  return normalizeQuestion(response);
}

export async function createQuestion(question) {
  const csrfHeader = await getCsrfHeader();
  const response = await request(QUESTIONS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeader },
    body: JSON.stringify(question),
  });
  return normalizeQuestion(response);
}
