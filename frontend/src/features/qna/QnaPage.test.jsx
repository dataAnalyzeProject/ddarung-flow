import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QnaPage from "./QnaPage";
import * as qnaApi from "./qnaApi";

jest.mock("./qnaApi");

const questions = [
  { id: "qna-1", category: "SERVICE", categoryLabel: "서비스 이용", visibility: "PUBLIC", status: "ANSWERED", title: "목적지 검색이 안 됩니다", body: "검색 결과가 없습니다.", authorId: null, createdAt: "2026. 8. 21. 오전 9:00", answer: null },
  { id: "qna-2", category: "PREDICTION", categoryLabel: "예측 결과", visibility: "PUBLIC", status: "OPEN", title: "도착 시간 기준은 어떻게 계산하나요?", body: "계산 기준이 궁금합니다.", authorId: null, createdAt: "2026. 8. 21. 오전 10:00", answer: null },
  { id: "qna-3", category: "ACCOUNT", categoryLabel: "계정", visibility: "PRIVATE", status: "ANSWERED", title: "저장한 경로가 보이지 않아요", body: "보관함에 없습니다.", authorId: "current-user", createdAt: "2026. 8. 20. 오후 5:00", answer: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  qnaApi.fetchQuestions.mockResolvedValue({ items: questions, page: 1, size: 10, total: 21 });
  qnaApi.fetchQuestion.mockImplementation(async (id) => questions.find((question) => question.id === id));
  qnaApi.createQuestion.mockResolvedValue({ id: "qna-new" });
});

test("loads the API list and keeps visibility, status, and server pagination cues", async () => {
  render(<QnaPage />);

  expect(screen.getByRole("status")).toHaveTextContent("질문을 불러오고 있습니다");
  expect(await screen.findAllByRole("button", { name: /질문 보기/ })).toHaveLength(3);
  expect(screen.getByLabelText("비공개")).toBeInTheDocument();
  expect(screen.getAllByText("답변 완료", { selector: ".qna-status" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
  expect(qnaApi.fetchQuestions).toHaveBeenCalledWith(expect.objectContaining({ scope: "PUBLIC", page: 1, size: 10 }));
});

test("search, filters, tabs, and pagination are forwarded to the fixed API adapter", async () => {
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");

  fireEvent.change(screen.getByPlaceholderText("제목 또는 내용 검색"), { target: { value: "도착 시간" } });
  fireEvent.change(screen.getByRole("combobox", { name: "분류" }), { target: { value: "PREDICTION" } });
  fireEvent.change(screen.getByRole("combobox", { name: "답변 상태" }), { target: { value: "OPEN" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  fireEvent.click(await screen.findByRole("button", { name: "2" }));

  await waitFor(() => expect(qnaApi.fetchQuestions).toHaveBeenLastCalledWith(expect.objectContaining({
    scope: "MINE",
    category: "PREDICTION",
    status: "OPEN",
    query: "도착 시간",
    page: 2,
  })));
});

test("opens detail through the API and returns to the list", async () => {
  render(<QnaPage />);
  fireEvent.click(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" }));

  expect(await screen.findByRole("heading", { name: "목적지 검색이 안 됩니다" })).toBeInTheDocument();
  expect(qnaApi.fetchQuestion).toHaveBeenCalledWith("qna-1");
  expect(screen.getByText("답변이 완료된 질문입니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  expect(await screen.findByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" })).toBeInTheDocument();
});

test("validates and posts a question, then refreshes the mine list", async () => {
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));
  expect(screen.getByRole("alert")).toHaveTextContent("제목과 내용을 모두 입력해 주세요.");

  fireEvent.change(screen.getByRole("textbox", { name: "질문 제목" }), { target: { value: "새 질문" } });
  fireEvent.change(screen.getByRole("textbox", { name: "질문 내용" }), { target: { value: "새 질문 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));

  await waitFor(() => expect(qnaApi.createQuestion).toHaveBeenCalledWith({ category: "SERVICE", visibility: "PUBLIC", title: "새 질문", body: "새 질문 내용" }));
  await waitFor(() => expect(qnaApi.fetchQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "MINE" })));
});

test("distinguishes empty, error, and login-required states", async () => {
  qnaApi.fetchQuestions.mockResolvedValueOnce({ items: [], page: 1, size: 10, total: 0 });
  const { unmount } = render(<QnaPage />);
  expect(await screen.findByText("조건에 맞는 질문이 없습니다.")).toBeInTheDocument();
  unmount();

  qnaApi.fetchQuestions.mockRejectedValueOnce(Object.assign(new Error("서버 연결 오류"), { status: 500 }));
  const errorView = render(<QnaPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("서버 연결 오류");
  errorView.unmount();

  qnaApi.fetchQuestions.mockResolvedValueOnce({ items: questions, page: 1, size: 10, total: 3 });
  qnaApi.fetchQuestions.mockRejectedValueOnce(Object.assign(new Error("로그인이 필요한 서비스입니다."), { status: 401 }));
  render(<QnaPage />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  expect(await screen.findByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login");
});

test("header navigation returns to the main route callback", async () => {
  const onNavigate = jest.fn();
  render(<QnaPage onNavigate={onNavigate} />);
  await screen.findByText("목적지 검색이 안 됩니다");
  fireEvent.click(screen.getByRole("button", { name: "대여 예측" }));
  expect(onNavigate).toHaveBeenCalledWith("main");
});
