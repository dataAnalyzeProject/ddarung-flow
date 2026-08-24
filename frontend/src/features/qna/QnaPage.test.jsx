import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QnaPage from "./QnaPage";
import { createQuestion, deleteQuestion, getQuestion, listQuestions, updateQuestion } from "./api/qnaApi";

jest.mock("./api/qnaApi", () => ({ createQuestion: jest.fn(), deleteQuestion: jest.fn(), getQuestion: jest.fn(), listQuestions: jest.fn(), updateQuestion: jest.fn() }));

const question = { id: 1, title: "목적지 검색이 안 됩니다", body: "내용", category: "SERVICE", categoryLabel: "서비스 이용", visibility: "PUBLIC", status: "OPEN", createdAt: "방금 전", answers: [] };
const renderPage = () => render(<QnaPage authState="authenticated" user={{ displayName: "사용자" }} />);

beforeEach(() => { jest.clearAllMocks(); listQuestions.mockResolvedValue({ items: [question], page: 0, size: 20, total: 1 }); });

test("loads the authenticated consumer question list from the API", async () => {
  renderPage();
  expect(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" })).toBeInTheDocument();
  expect(listQuestions).toHaveBeenCalledWith(expect.objectContaining({ scope: "PUBLIC" }));
});

test("uses the API for question detail and mine scope", async () => {
  getQuestion.mockResolvedValue(question);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));
  expect(await screen.findByRole("heading", { name: "목적지 검색이 안 됩니다" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  await waitFor(() => expect(listQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "MINE" })));
});

test("shows auth-required state without a session", async () => {
  render(<QnaPage authState="anonymous" />);
  expect(await screen.findByText("로그인이 필요합니다.")).toBeInTheDocument();
  expect(listQuestions).not.toHaveBeenCalled();
});

test("creates a question through the API", async () => {
  createQuestion.mockResolvedValue(question);
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fireEvent.change(screen.getByRole("textbox", { name: "질문 제목" }), { target: { value: "새 질문" } });
  fireEvent.change(screen.getByRole("textbox", { name: "질문 내용" }), { target: { value: "새 질문 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));
  await waitFor(() => expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({ title: "새 질문", body: "새 질문 내용" })));
});

test("shows loading while the question list is pending", () => {
  listQuestions.mockReturnValue(new Promise(() => {}));
  renderPage();
  expect(screen.getByText("불러오는 중입니다.")).toBeInTheDocument();
});

test("allows only the author to edit and delete a question", async () => {
  const ownQuestion = { ...question, authorId: "mine" };
  getQuestion.mockResolvedValue(ownQuestion);
  updateQuestion.mockResolvedValue({ ...ownQuestion, title: "수정된 질문" });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));
  expect(await screen.findByRole("button", { name: "수정" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  fireEvent.change(screen.getByRole("textbox", { name: "질문 제목" }), { target: { value: "수정된 질문" } });
  fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));
  await waitFor(() => expect(updateQuestion).toHaveBeenCalledWith(1, expect.objectContaining({ title: "수정된 질문" })));
  expect(await screen.findByRole("heading", { name: "수정된 질문" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(deleteQuestion).toHaveBeenCalledWith(1));
});

test("does not show edit or delete controls for another user's question", async () => {
  getQuestion.mockResolvedValue({ ...question, authorId: "other" });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));
  await screen.findByRole("heading", { name: "목적지 검색이 안 됩니다" });
  expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
});

test("shows empty, retryable error, and not-found states", async () => {
  listQuestions.mockResolvedValueOnce({ items: [], page: 0, size: 20, total: 0 });
  renderPage();
  expect(await screen.findByText("조건에 맞는 질문이 없습니다.")).toBeInTheDocument();
});

test("retries list errors and shows detail not-found", async () => {
  listQuestions.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ items: [question], page: 0, size: 20, total: 1 });
  renderPage();
  expect(await screen.findByText("질문을 표시할 수 없습니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" })).toBeInTheDocument();
  getQuestion.mockRejectedValue({ status: 404 });
  fireEvent.click(screen.getByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));
  expect(await screen.findByText("질문을 찾을 수 없습니다.")).toBeInTheDocument();
});
