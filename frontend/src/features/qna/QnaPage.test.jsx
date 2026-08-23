import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QnaPage from "./QnaPage";
import * as qnaApi from "./api/qnaApi";

jest.mock("./api/qnaApi");

const questions = [
  { id: "qna-1", category: "SERVICE", visibility: "PUBLIC", status: "ANSWERED", title: "목적지 검색이 안 됩니다", body: "검색 결과가 없습니다.", isAuthor: false, createdAt: "2026-08-21T09:00:00+09:00" },
  { id: "qna-2", category: "PREDICTION", visibility: "PUBLIC", status: "OPEN", title: "도착 시간 기준은 어떻게 계산하나요?", body: "계산 기준이 궁금합니다.", isAuthor: false, createdAt: "2026-08-21T10:00:00+09:00" },
  { id: "qna-3", category: "ACCOUNT", visibility: "PRIVATE", status: "ANSWERED", title: "저장한 경로가 보이지 않아요", body: "보관함에 없습니다.", isAuthor: true, createdAt: "2026-08-20T17:00:00+09:00" },
];

beforeEach(() => {
  jest.clearAllMocks();
  qnaApi.listQuestions.mockResolvedValue({ items: questions, page: 0, size: 10, total: 3 });
  qnaApi.getQuestion.mockImplementation(async (id) => questions.find((question) => question.id === id));
  qnaApi.createQuestion.mockResolvedValue({ id: "qna-new" });
  qnaApi.updateQuestion.mockImplementation(async (id, payload) => ({ ...questions.find((question) => question.id === id), ...payload }));
  qnaApi.deleteQuestion.mockResolvedValue(null);
});

function fillQuestionForm({ title = "새 질문", body = "새 질문 내용" } = {}) {
  fireEvent.change(screen.getByRole("textbox", { name: "질문 제목" }), { target: { value: title } });
  fireEvent.change(screen.getByRole("textbox", { name: "질문 내용" }), { target: { value: body } });
}

test("shows loading and then renders the API PageResponse items", async () => {
  render(<QnaPage />);

  expect(screen.getByRole("status")).toHaveTextContent("질문을 불러오는 중입니다");
  expect(await screen.findAllByRole("button", { name: /질문 보기/ })).toHaveLength(3);
  expect(screen.getByLabelText("비공개")).toBeInTheDocument();
  expect(qnaApi.listQuestions).toHaveBeenCalledWith(expect.objectContaining({ scope: "PUBLIC", page: 0, size: 10 }));
});

test("forwards search, filters, mine scope, and zero-based page to the adapter", async () => {
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");

  fireEvent.change(screen.getByPlaceholderText("제목 또는 내용 검색"), { target: { value: "도착 시간" } });
  fireEvent.change(screen.getByRole("combobox", { name: "분류" }), { target: { value: "PREDICTION" } });
  fireEvent.change(screen.getByRole("combobox", { name: "답변 상태" }), { target: { value: "OPEN" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  fireEvent.click(await screen.findByRole("button", { name: "2" }));

  await waitFor(() => expect(qnaApi.listQuestions).toHaveBeenLastCalledWith(expect.objectContaining({
    scope: "MINE",
    category: "PREDICTION",
    status: "OPEN",
    query: "도착 시간",
    page: 1,
  })));
});

test("renders the fixed empty state", async () => {
  qnaApi.listQuestions.mockResolvedValueOnce({ items: [], page: 0, size: 10, total: 0 });
  render(<QnaPage />);
  expect(await screen.findByText("조건에 맞는 질문이 없습니다.")).toBeInTheDocument();
});

test("renders the login-required list state for 401", async () => {
  qnaApi.listQuestions.mockRejectedValueOnce(Object.assign(new Error("로그인이 필요합니다."), { status: 401 }));
  render(<QnaPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("로그인이 필요합니다.");
  expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login");
});

test("hides update and delete controls when isAuthor is false", async () => {
  render(<QnaPage />);
  fireEvent.click(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));

  expect(await screen.findByRole("heading", { name: "목적지 검색이 안 됩니다" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
});

test("shows author controls and connects PATCH and DELETE actions", async () => {
  render(<QnaPage />);
  fireEvent.click(await screen.findByRole("button", { name: "저장한 경로가 보이지 않아요 질문 보기" }));

  expect(await screen.findByRole("button", { name: "수정" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  fireEvent.change(screen.getByRole("textbox", { name: "질문 제목" }), { target: { value: "수정된 질문" } });
  fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));

  await waitFor(() => expect(qnaApi.updateQuestion).toHaveBeenCalledWith("qna-3", expect.objectContaining({ title: "수정된 질문" })));
  expect(await screen.findByRole("heading", { name: "수정된 질문" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(qnaApi.deleteQuestion).toHaveBeenCalledWith("qna-3"));
  expect(await screen.findByText("목적지 검색이 안 됩니다")).toBeInTheDocument();
});

test("shows the fixed detail message for 404", async () => {
  qnaApi.getQuestion.mockRejectedValueOnce(Object.assign(new Error("not found"), { status: 404 }));
  render(<QnaPage />);
  fireEvent.click(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("볼 수 없거나 삭제된 질문입니다");
  expect(screen.getByRole("button", { name: "목록으로" })).toBeInTheDocument();
});

test("creates a question and reloads the MINE list", async () => {
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));
  expect(screen.getByRole("alert")).toHaveTextContent("제목과 내용을 모두 입력해 주세요.");

  fillQuestionForm();
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));

  await waitFor(() => expect(qnaApi.createQuestion).toHaveBeenCalledWith({ category: "SERVICE", visibility: "PUBLIC", title: "새 질문", body: "새 질문 내용" }));
  await waitFor(() => expect(qnaApi.listQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "MINE" })));
});

test("shows the fixed form guidance for 401", async () => {
  qnaApi.createQuestion.mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }));
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fillQuestionForm();
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("로그인 후 질문을 작성할 수 있습니다");
  await waitFor(() => expect(screen.getByRole("button", { name: "질문 등록" })).toBeEnabled());
});

test("shows the response message in the form for 409", async () => {
  qnaApi.createQuestion.mockRejectedValueOnce(Object.assign(new Error("동일한 질문이 이미 등록되어 있습니다."), { status: 409 }));
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fillQuestionForm();
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("동일한 질문이 이미 등록되어 있습니다.");
  await waitFor(() => expect(screen.getByRole("button", { name: "질문 등록" })).toBeEnabled());
});

test("keeps shared header navigation behavior", async () => {
  const onNavigate = jest.fn();
  render(<QnaPage onNavigate={onNavigate} />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("button", { name: "대여 예측" }));
  expect(onNavigate).toHaveBeenCalledWith("main");
});
