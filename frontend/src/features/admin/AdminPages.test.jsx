import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPages";
import { answerQuestion, hideQuestion, listAdminQuestions } from "./qnaAdminApi";

jest.mock("./qnaAdminApi", () => ({
  listAdminQuestions: jest.fn(),
  answerQuestion: jest.fn(),
  hideQuestion: jest.fn(),
}));

const qnaPage = { items: [{ id: 104, title: "Q&A 질문", body: "질문 내용", category: "SERVICE", visibility: "PUBLIC", status: "PENDING", answers: [] }] };

beforeEach(() => {
  listAdminQuestions.mockResolvedValue(qnaPage);
  answerQuestion.mockResolvedValue({});
  hideQuestion.mockResolvedValue({});
});

const renderPage = (menuId, actorRole, onAction = jest.fn()) => {
  render(<AdminPage menuId={menuId} actorRole={actorRole} onAction={onAction} />);
  return onAction;
};

test("admin sends export callback without confirming success", () => {
  const onAction = renderPage("export", "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "Export 요청" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "export_request" }));
  expect(screen.queryByText("요청 완료")).not.toBeInTheDocument();
});

test("role change dialog can cancel and sends the ADMIN role", () => {
  const onAction = renderPage("users", "ADMIN");
  fireEvent.click(screen.getAllByRole("button", { name: "역할 변경" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "역할 변경" })[1]);
  fireEvent.click(screen.getByRole("button", { name: "변경 확인" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "change_role", nextRole: "ADMIN" }));
});

test("admin loads an API question and sends its answer", async () => {
  renderPage("qna", "ADMIN");
  expect(await screen.findByRole("button", { name: "Q&A 질문" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "답변 내용" }), { target: { value: "답변 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith(104, "답변 내용"));
});

test("admin can hide an API question", async () => {
  render(<AdminPage menuId="qna" actorRole="ADMIN" />);
  fireEvent.click(await screen.findByRole("button", { name: "숨김" }));
  await waitFor(() => expect(hideQuestion).toHaveBeenCalledWith(104));
});

test("admin Q&A 목록에서 상세로 이동해 답변과 숨김 API를 호출한 뒤 목록으로 돌아간다", async () => {
  renderPage("qna", "ADMIN");

  fireEvent.click(await screen.findByRole("button", { name: "Q&A 질문" }));
  expect(screen.getByRole("heading", { name: "관리자 / Q&A 관리 / 104" })).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: "답변 내용" }), { target: { value: "답변 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith(104, "답변 내용"));

  fireEvent.click(screen.getByRole("button", { name: "목록으로 돌아가기" }));
  expect(await screen.findByRole("button", { name: "Q&A 질문" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Q&A 질문" }));
  fireEvent.click(screen.getByRole("button", { name: "숨김" }));
  await waitFor(() => expect(hideQuestion).toHaveBeenCalledWith(104));
  expect(await screen.findByRole("button", { name: "Q&A 질문" })).toBeInTheDocument();
});

test("qna overview shows the API result count", async () => {
  renderPage("qna", "ADMIN");
  expect(await screen.findByText("문의 목록 · 1건")).toBeInTheDocument();
});

test("admin may approve model", () => {
  const onAction = renderPage("modelops", "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "승인" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "approve_model" }));
});
