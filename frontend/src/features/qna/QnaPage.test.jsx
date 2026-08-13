import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QnaPage from "./QnaPage";

test("renders the three reference questions with visibility and status cues", () => {
  render(<QnaPage />);

  expect(screen.getAllByRole("button", { name: /질문 보기/ })).toHaveLength(3);
  expect(screen.getByText("목적지 검색이 안 됩니다")).toBeInTheDocument();
  expect(screen.getByText("도착 시간 기준은 어떻게 계산하나요?")).toBeInTheDocument();
  expect(screen.getByText("저장한 경로가 보이지 않아요")).toBeInTheDocument();
  expect(screen.getByLabelText("비공개")).toBeInTheDocument();
  expect(screen.getAllByText("답변 완료", { selector: ".qna-status" })).toHaveLength(2);
  expect(screen.getByText("답변 대기", { selector: ".qna-status" })).toBeInTheDocument();
});

test("search, filters, tabs, and pagination update the fixture list", () => {
  render(<QnaPage />);

  fireEvent.change(screen.getByPlaceholderText("제목 또는 내용 검색"), { target: { value: "도착 시간" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  expect(screen.getByText("도착 시간 기준은 어떻게 계산하나요?")).toBeInTheDocument();
  expect(screen.queryByText("목적지 검색이 안 됩니다")).not.toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("제목 또는 내용 검색"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.change(screen.getByRole("combobox", { name: "답변 상태" }), { target: { value: "ANSWERED" } });
  expect(screen.queryByText("도착 시간 기준은 어떻게 계산하나요?")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "내 질문" }));
  expect(screen.getByText("저장한 경로가 보이지 않아요")).toBeInTheDocument();
  expect(screen.queryByText("목적지 검색이 안 됩니다")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "2" }));
  expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "이전 페이지" })).toBeEnabled();
});

test("question cards open from the keyboard and return to the list", async () => {
  render(<QnaPage />);
  const firstQuestion = screen.getByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" });
  firstQuestion.focus();
  await userEvent.keyboard("{Enter}");

  expect(screen.getByRole("heading", { name: "목적지 검색이 안 됩니다" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  expect(screen.getByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" })).toBeInTheDocument();
});

test("question composer validates, creates a local fixture, and returns to my questions", () => {
  render(<QnaPage />);
  fireEvent.click(screen.getByRole("button", { name: "질문 작성" }));
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));
  expect(screen.getByRole("alert")).toHaveTextContent("제목과 내용을 모두 입력해 주세요.");

  fireEvent.change(screen.getByRole("textbox", { name: "질문 제목" }), { target: { value: "새 질문" } });
  fireEvent.change(screen.getByRole("textbox", { name: "질문 내용" }), { target: { value: "새 질문 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "질문 등록" }));

  expect(screen.getByRole("tab", { name: "내 질문" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("새 질문")).toBeInTheDocument();
});

test("header navigation returns to the main route callback", () => {
  const onNavigate = jest.fn();
  render(<QnaPage onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "대여 예측" }));
  expect(onNavigate).toHaveBeenCalledWith("main");
});
