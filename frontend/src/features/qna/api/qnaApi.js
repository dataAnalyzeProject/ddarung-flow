const API_BASE_PATH = "/api/v1";
const QUESTIONS_PATH = `${API_BASE_PATH}/qna/questions`;

class QnaApiRequestError extends Error {
  constructor({ code = "QNA_API_ERROR", message = "Q&A 요청을 처리하지 못했습니다.", status = 0 } = {}) {
    super(message);
    this.name = "QnaApiRequestError";
    this.code = code;
    this.status = status;
  }
}

function fallbackMessage(status) {
  if (status === 401) return "로그인이 필요합니다.";
  if (status === 404) return "볼 수 없거나 삭제된 질문입니다";
  if (status === 409) return "요청 내용이 현재 상태와 충돌합니다.";
  return "Q&A 요청을 처리하지 못했습니다.";
}

async function parseResponse(response) {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }

  let errorBody = {};
  try {
    errorBody = await response.json();
  } catch {
    // Empty and non-JSON failures use the stable status-specific message.
  }

  throw new QnaApiRequestError({
    code: errorBody.code || "QNA_API_ERROR",
    message: errorBody.message || fallbackMessage(response.status),
    status: response.status,
  });
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
  });
  return parseResponse(response);
}

async function getCsrfHeader() {
  const csrf = await request(`${API_BASE_PATH}/auth/csrf`);
  if (!csrf?.headerName || !csrf?.token) {
    throw new QnaApiRequestError({
      code: "QNA_CSRF_ERROR",
      message: "보안 토큰을 확인하지 못했습니다.",
    });
  }
  return { [csrf.headerName]: csrf.token };
}

async function mutationOptions(method, body) {
  const csrfHeader = await getCsrfHeader();
  return {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...csrfHeader,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export async function listQuestions({
  scope = "PUBLIC",
  category = "ALL",
  status = "ALL",
  query = "",
  page = 0,
  size = 10,
  signal,
} = {}) {
  const params = new URLSearchParams({
    scope,
    page: String(page),
    size: String(size),
  });
  if (category !== "ALL") params.set("category", category);
  if (status !== "ALL") params.set("status", status);
  if (query) params.set("query", query);

  return request(`${QUESTIONS_PATH}?${params}`, { signal });
}

export async function createQuestion(question) {
  return request(QUESTIONS_PATH, await mutationOptions("POST", question));
}

export async function getQuestion(questionId, { signal } = {}) {
  return request(`${QUESTIONS_PATH}/${encodeURIComponent(questionId)}`, { signal });
}

export async function updateQuestion(questionId, question) {
  return request(
    `${QUESTIONS_PATH}/${encodeURIComponent(questionId)}`,
    await mutationOptions("PATCH", question)
  );
}

export async function deleteQuestion(questionId) {
  return request(
    `${QUESTIONS_PATH}/${encodeURIComponent(questionId)}`,
    await mutationOptions("DELETE")
  );
}
