import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QnaPage from "./QnaPage";
import { createQuestion, getQuestion, listQuestions } from "./api/qnaApi";

jest.mock("./api/qnaApi", () => ({ createQuestion: jest.fn(), getQuestion: jest.fn(), listQuestions: jest.fn() }));

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
