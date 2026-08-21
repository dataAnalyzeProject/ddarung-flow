import { createQuestion, fetchQuestion, fetchQuestions, QnaApiError } from "./qnaApi";

const apiQuestion = {
  id: "4b6f7dd1-6f78-4d77-b1b1-1abf2456c999",
  title: "API 질문",
  body: "질문 내용",
  category: "SERVICE",
  visibility: "PUBLIC",
  status: "OPEN",
  isAuthor: true,
  createdAt: "2026-08-21T09:00:00+09:00",
  updatedAt: "2026-08-21T09:00:00+09:00",
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: jest.fn().mockResolvedValue(body) };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

test("builds the documented list query and normalizes the backend DTO", async () => {
  global.fetch.mockResolvedValue(jsonResponse({ items: [apiQuestion], page: 2, size: 10, total: 11 }));

  const result = await fetchQuestions({ scope: "MINE", category: "SERVICE", status: "OPEN", query: "API 질문", page: 2, size: 10 });

  const requestedUrl = global.fetch.mock.calls[0][0];
  expect(requestedUrl).toContain("/api/v1/qna/questions?");
  expect(requestedUrl).toContain("scope=MINE");
  expect(requestedUrl).toContain("category=SERVICE");
  expect(requestedUrl).toContain("status=OPEN");
  expect(requestedUrl).toContain("query=API+%EC%A7%88%EB%AC%B8");
  expect(result.items[0]).toEqual(expect.objectContaining({ categoryLabel: "서비스 이용", authorId: "current-user" }));
  expect(global.fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ credentials: "include" }));
});

test("loads detail from the fixed question endpoint", async () => {
  global.fetch.mockResolvedValue(jsonResponse(apiQuestion));
  await fetchQuestion(apiQuestion.id);
  expect(global.fetch.mock.calls[0][0]).toBe(`http://localhost:8080/api/v1/qna/questions/${apiQuestion.id}`);
});

test("uses the existing CSRF contract before posting a question", async () => {
  global.fetch
    .mockResolvedValueOnce(jsonResponse({ headerName: "X-CSRF-TOKEN", token: "csrf-token" }))
    .mockResolvedValueOnce(jsonResponse(apiQuestion, { status: 201 }));

  await createQuestion({ title: "API 질문", body: "질문 내용", category: "SERVICE", visibility: "PUBLIC" });

  expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:8080/api/v1/auth/csrf");
  expect(global.fetch.mock.calls[1][1]).toEqual(expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({ "Content-Type": "application/json", "X-CSRF-TOKEN": "csrf-token" }),
  }));
});

test("preserves fixed backend error status, code, and message", async () => {
  global.fetch.mockResolvedValue(jsonResponse({ code: "QNA_UNAUTHORIZED", message: "로그인이 필요한 서비스입니다." }, { ok: false, status: 401 }));
  await expect(fetchQuestions({ scope: "MINE" })).rejects.toEqual(expect.objectContaining({
    name: "QnaApiError",
    code: "QNA_UNAUTHORIZED",
    status: 401,
    message: "로그인이 필요한 서비스입니다.",
  }));
  expect(QnaApiError).toBeDefined();
});
