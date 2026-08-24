import { createQuestion, deleteQuestion, mapQuestion, updateQuestion } from "./qnaApi";

test("maps server PENDING status and category labels for the consumer", () => {
  expect(mapQuestion({ id: 1, category: "USAGE", status: "PENDING", answers: [] })).toMatchObject({
    id: 1,
    categoryLabel: "서비스 이용",
    status: "OPEN",
  });
});

test("sends a fresh CSRF header for create, update, and delete mutations", async () => {
  const response = (body) => ({ ok: true, status: 200, json: async () => body });
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "first" }))
    .mockResolvedValueOnce(response({ id: 1, category: "USAGE", status: "PENDING", answers: [] }))
    .mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "second" }))
    .mockResolvedValueOnce(response({ id: 1, category: "USAGE", status: "PENDING", answers: [] }))
    .mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "third" }))
    .mockResolvedValueOnce({ ok: true, status: 204 });

  await createQuestion({ title: "질문", body: "내용", category: "USAGE", visibility: "PUBLIC" });
  await updateQuestion(1, { title: "수정", body: "내용", category: "USAGE", visibility: "PUBLIC" });
  await deleteQuestion(1);

  expect(global.fetch).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/v1/qna/questions", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-CSRF-TOKEN": "first" }) }));
  expect(global.fetch).toHaveBeenNthCalledWith(4, "http://localhost:8080/api/v1/qna/questions/1", expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "X-CSRF-TOKEN": "second" }) }));
  expect(global.fetch).toHaveBeenNthCalledWith(6, "http://localhost:8080/api/v1/qna/questions/1", expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "X-CSRF-TOKEN": "third" }) }));
});
