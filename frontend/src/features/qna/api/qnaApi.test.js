import * as qnaApi from "./qnaApi";

const apiQuestion = {
  id: "4b6f7dd1-6f78-4d77-b1b1-1abf2456c999",
  title: "API 질문",
  body: "질문 내용",
  category: "SERVICE",
  visibility: "PUBLIC",
  status: "OPEN",
  isAuthor: true,
  createdAt: "2026-08-21T09:00:00+09:00",
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

test("exports only the five functions fixed by the task contract", () => {
  expect(Object.keys(qnaApi).sort()).toEqual([
    "createQuestion",
    "deleteQuestion",
    "getQuestion",
    "listQuestions",
    "updateQuestion",
  ]);
});

test("builds the fixed list query and returns the PageResponse unchanged", async () => {
  const pageResponse = { items: [apiQuestion], page: 0, size: 10, total: 1 };
  global.fetch.mockResolvedValue(jsonResponse(pageResponse));

  const result = await qnaApi.listQuestions({
    scope: "MINE",
    category: "SERVICE",
    status: "OPEN",
    query: "API 질문",
    page: 0,
    size: 10,
  });

  const [requestedUrl, options] = global.fetch.mock.calls[0];
  expect(requestedUrl).toContain("/api/v1/qna/questions?");
  expect(requestedUrl).toContain("scope=MINE");
  expect(requestedUrl).toContain("category=SERVICE");
  expect(requestedUrl).toContain("status=OPEN");
  expect(requestedUrl).toContain("query=API+%EC%A7%88%EB%AC%B8");
  expect(requestedUrl).toContain("page=0");
  expect(result).toEqual(pageResponse);
  expect(options).toEqual(expect.objectContaining({ credentials: "include" }));
});

test("gets a question from the relative detail endpoint", async () => {
  global.fetch.mockResolvedValue(jsonResponse(apiQuestion));
  await expect(qnaApi.getQuestion(apiQuestion.id)).resolves.toEqual(apiQuestion);
  expect(global.fetch.mock.calls[0][0]).toBe(`/api/v1/qna/questions/${apiQuestion.id}`);
});

test("uses the existing CSRF contract for POST and sends the CreateRequest body", async () => {
  const payload = { title: "API 질문", body: "질문 내용", category: "SERVICE", visibility: "PUBLIC" };
  global.fetch
    .mockResolvedValueOnce(jsonResponse({ headerName: "X-CSRF-TOKEN", token: "csrf-token" }))
    .mockResolvedValueOnce(jsonResponse(apiQuestion, { status: 201 }));

  await qnaApi.createQuestion(payload);

  expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/auth/csrf");
  expect(global.fetch.mock.calls[1]).toEqual([
    "/api/v1/qna/questions",
    expect.objectContaining({
      credentials: "include",
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json", "X-CSRF-TOKEN": "csrf-token" }),
      body: JSON.stringify(payload),
    }),
  ]);
});

test("uses PATCH for an author update and DELETE for an author removal", async () => {
  const update = { title: "수정 질문", body: "수정 내용", category: "SERVICE", visibility: "PRIVATE" };
  global.fetch
    .mockResolvedValueOnce(jsonResponse({ headerName: "X-CSRF-TOKEN", token: "update-token" }))
    .mockResolvedValueOnce(jsonResponse({ ...apiQuestion, ...update }))
    .mockResolvedValueOnce(jsonResponse({ headerName: "X-CSRF-TOKEN", token: "delete-token" }))
    .mockResolvedValueOnce({ ok: true, status: 204, json: jest.fn() });

  await qnaApi.updateQuestion(apiQuestion.id, update);
  await qnaApi.deleteQuestion(apiQuestion.id);

  expect(global.fetch.mock.calls[1]).toEqual([
    `/api/v1/qna/questions/${apiQuestion.id}`,
    expect.objectContaining({ method: "PATCH", body: JSON.stringify(update) }),
  ]);
  expect(global.fetch.mock.calls[3]).toEqual([
    `/api/v1/qna/questions/${apiQuestion.id}`,
    expect.objectContaining({ method: "DELETE" }),
  ]);
});

test.each([
  [401, "QNA_UNAUTHORIZED", "로그인이 필요합니다."],
  [404, "QNA_NOT_FOUND", "볼 수 없거나 삭제된 질문입니다"],
  [409, "QNA_CONFLICT", "이미 등록된 질문입니다."],
])("preserves sanitized %i error code, status, and message", async (status, code, message) => {
  global.fetch.mockResolvedValue(jsonResponse({ code, message }, { ok: false, status }));

  await expect(qnaApi.getQuestion("question-id")).rejects.toMatchObject({ code, message, status });
});
