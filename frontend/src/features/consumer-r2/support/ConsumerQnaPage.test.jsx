import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerQnaPage from "./ConsumerQnaPage";

const question = {
  id: 7,
  title: "대여소 검색은 어떻게 하나요?",
  body: "검색 방법이 궁금합니다.",
  category: "USAGE",
  categoryLabel: "서비스 이용",
  visibility: "PUBLIC",
  status: "OPEN",
  createdAt: "2026. 9. 3.",
  authorId: "mine",
  answer: null,
};

function adapter(overrides = {}) {
  return {
    listQuestions: jest.fn().mockResolvedValue({ items: [question], page: 0, size: 20, total: 21 }),
    getQuestion: jest.fn().mockResolvedValue(question),
    createQuestion: jest.fn().mockResolvedValue({ ...question, id: 8, title: "새 질문" }),
    updateQuestion: jest.fn().mockResolvedValue({ ...question, title: "수정 질문" }),
    deleteQuestion: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

test("covers all/mine, search filters, pagination, and detail answer state", async () => {
  const api = adapter();
  render(<ConsumerQnaPage adapter={api} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "질문 검색" }), { target: { value: "검색" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.change(screen.getByLabelText("분류"), { target: { value: "STATION" } });
  fireEvent.change(screen.getByLabelText("답변 상태"), { target: { value: "OPEN" } });
  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  await waitFor(() => expect(api.listQuestions).toHaveBeenLastCalledWith({ scope: "MINE", query: "검색", category: "STATION", status: "PENDING", page: 0 }));
  fireEvent.click(await screen.findByRole("button", { name: "다음" }));
  await waitFor(() => expect(api.listQuestions).toHaveBeenLastCalledWith({ scope: "MINE", query: "검색", category: "STATION", status: "PENDING", page: 1 }));
  fireEvent.click(await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ }));
  expect(await screen.findByRole("heading", { name: "대여소 검색은 어떻게 하나요?" })).toBeInTheDocument();
  expect(screen.getByText(/아직 답변이 등록되지 않았습니다/)).toBeInTheDocument();
});

test("keeps create, edit, and delete on the existing Q&A CRUD semantics", async () => {
  const api = adapter();
  render(<ConsumerQnaPage adapter={api} />);
  await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ });
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "새 질문" } });
  fireEvent.change(screen.getByLabelText("내용"), { target: { value: "새 질문 내용" } });
  fireEvent.change(screen.getByLabelText("공개 여부"), { target: { value: "PRIVATE" } });
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));
  await waitFor(() => expect(api.createQuestion).toHaveBeenCalledWith(expect.objectContaining({ title: "새 질문", body: "새 질문 내용", visibility: "PRIVATE" })));
  fireEvent.click(await screen.findByRole("button", { name: "수정" }));
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "수정 질문" } });
  fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));
  await waitFor(() => expect(api.updateQuestion).toHaveBeenCalledWith(8, expect.objectContaining({ title: "수정 질문" })));
  fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
  expect(screen.getByRole("group", { name: "이 질문을 삭제할까요?" })).toHaveTextContent("되돌릴 수 없습니다");
  fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));
  await waitFor(() => expect(api.deleteQuestion).toHaveBeenCalledWith(7));
});

test("keeps answered questions editable for their author", async () => {
  const answered = { ...question, status: "ANSWERED", answer: "검색창에서 장소를 입력해 주세요." };
  const api = adapter({ getQuestion: jest.fn().mockResolvedValue(answered) });
  render(<ConsumerQnaPage adapter={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ }));
  expect(await screen.findByText("검색창에서 장소를 입력해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
});

test("does not offer edits for another user's question", async () => {
  const answered = { ...question, status: "ANSWERED", authorId: "other", answer: "검색창에서 장소를 입력해 주세요." };
  const api = adapter({ getQuestion: jest.fn().mockResolvedValue(answered) });
  render(<ConsumerQnaPage adapter={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ }));
  expect(await screen.findByText("검색창에서 장소를 입력해 주세요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
});

test("labels a closed question and does not offer editing", async () => {
  const closed = { ...question, status: "CLOSED" };
  const api = adapter({ getQuestion: jest.fn().mockResolvedValue(closed) });
  render(<ConsumerQnaPage adapter={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ }));
  expect(await screen.findByText("종료")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
});

test("clears a private detail when authentication ends", async () => {
  const privateQuestion = { ...question, visibility: "PRIVATE", body: "비공개 문의 내용" };
  const api = adapter({ getQuestion: jest.fn().mockResolvedValue(privateQuestion) });
  const { rerender } = render(<ConsumerQnaPage adapter={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ }));
  expect(await screen.findByText("비공개 문의 내용")).toBeInTheDocument();
  rerender(<ConsumerQnaPage adapter={api} authState="anonymous" />);
  expect(screen.getByRole("alert")).toHaveTextContent("로그인이 필요합니다");
  expect(screen.queryByText("비공개 문의 내용")).not.toBeInTheDocument();
});

test("ignores a stale list response after the scope changes", async () => {
  let resolvePublic;
  let resolveMine;
  const api = adapter({
    listQuestions: jest.fn(({ scope }) => new Promise((resolve) => {
      if (scope === "PUBLIC") resolvePublic = resolve;
      else resolveMine = resolve;
    })),
  });
  render(<ConsumerQnaPage adapter={api} />);
  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  await waitFor(() => expect(resolveMine).toBeDefined());
  resolveMine({ items: [{ ...question, id: 8, title: "내 최신 질문" }], page: 0, size: 20, total: 1 });
  expect(await screen.findByText("내 최신 질문")).toBeInTheDocument();
  resolvePublic({ items: [{ ...question, id: 9, title: "늦게 도착한 공개 질문" }], page: 0, size: 20, total: 1 });
  await waitFor(() => expect(screen.queryByText("늦게 도착한 공개 질문")).not.toBeInTheDocument());
  expect(screen.getByText("내 최신 질문")).toBeInTheDocument();
});

test("does not restore a completed create after authentication ends", async () => {
  let resolveCreate;
  const api = adapter({ createQuestion: jest.fn(() => new Promise((resolve) => { resolveCreate = resolve; })) });
  const { rerender } = render(<ConsumerQnaPage adapter={api} />);
  await screen.findByRole("button", { name: "질문 작성" });
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "이전 계정 비공개 질문" } });
  fireEvent.change(screen.getByLabelText("내용"), { target: { value: "표시되면 안 되는 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));
  rerender(<ConsumerQnaPage adapter={api} authState="anonymous" />);
  resolveCreate({ ...question, title: "이전 계정 비공개 질문", body: "표시되면 안 되는 내용", visibility: "PRIVATE" });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("로그인이 필요합니다"));
  expect(screen.queryByText("표시되면 안 되는 내용")).not.toBeInTheDocument();
});

test("returns to the previous page after deleting the last item", async () => {
  const api = adapter({
    listQuestions: jest.fn(({ page }) => Promise.resolve({ items: [question], page, size: 20, total: 21 })),
  });
  render(<ConsumerQnaPage adapter={api} />);
  fireEvent.click(await screen.findByRole("button", { name: "다음" }));
  await waitFor(() => expect(api.listQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
  fireEvent.click(await screen.findByRole("button", { name: /대여소 검색은 어떻게 하나요.*질문 보기/ }));
  fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));
  await waitFor(() => expect(api.listQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })));
  expect(screen.getByRole("status")).toHaveTextContent("질문을 삭제했습니다");
});

test("accepts a TASK-301 questionId boundary for QNA_ANSWERED initial entry", async () => {
  const answered = { ...question, status: "ANSWERED", answer: "검색창에서 장소를 입력해 주세요." };
  const api = adapter({ getQuestion: jest.fn().mockResolvedValue(answered) });
  render(<ConsumerQnaPage adapter={api} initialQuestionId="7" />);
  expect(await screen.findByRole("heading", { name: "대여소 검색은 어떻게 하나요?" })).toBeInTheDocument();
  expect(api.getQuestion).toHaveBeenCalledWith("7");
});

test("shows loading, empty, error, and auth states without fetching guest data", async () => {
  const guestApi = adapter();
  const onNavigate = jest.fn();
  const { rerender } = render(<ConsumerQnaPage adapter={guestApi} authState="anonymous" onNavigate={onNavigate} />);
  expect(screen.getByRole("alert")).toHaveTextContent("로그인이 필요합니다");
  expect(guestApi.listQuestions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  expect(onNavigate).toHaveBeenCalledWith("login");

  let resolveList;
  const loadingApi = adapter({ listQuestions: jest.fn(() => new Promise((resolve) => { resolveList = resolve; })) });
  rerender(<ConsumerQnaPage adapter={loadingApi} />);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  resolveList({ items: [], page: 0, size: 20, total: 0 });
  expect(await screen.findByRole("heading", { name: "조건에 맞는 질문이 없습니다" })).toBeInTheDocument();

  const failingApi = adapter({ listQuestions: jest.fn().mockRejectedValue(new Error("DOWN")) });
  rerender(<ConsumerQnaPage adapter={failingApi} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("질문을 불러오지 못했습니다");
});
