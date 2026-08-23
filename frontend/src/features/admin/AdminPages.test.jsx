import { fireEvent, render, screen, within } from "@testing-library/react";
import { AdminPage } from "./AdminPages";

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

test("admin can answer and close public qna", () => {
  const onAction = renderPage("qna", "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  fireEvent.click(screen.getByRole("button", { name: "종료" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "answer_qna", questionId: "Q-104" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "change_qna_state", nextState: "CLOSED" }));
});

test("private question text is protected and admin can hide", () => {
  render(<AdminPage menuId="qna" actorRole="ADMIN" />);
  expect(screen.getByText("PRIVATE 문의 원문과 개인정보는 관리자 fixture에서 표시하지 않습니다.")).toBeInTheDocument();
  expect(screen.getByText("PRIVATE 보호")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "숨김" })).toBeInTheDocument();
});

test("qna overview keeps eight fixture rows and the state transition guide", () => {
  renderPage("qna", "ADMIN");
  expect(screen.getByText("문의 목록 · 8건")).toBeInTheDocument();
  const guide = screen.getByText("상태 전이 가이드").closest("section");
  expect(within(guide).getByText("OPEN")).toBeInTheDocument();
  expect(within(guide).getByText("ANSWERED")).toBeInTheDocument();
  expect(within(guide).getByText("CLOSED")).toBeInTheDocument();
});

test("admin may approve model", () => {
  const onAction = renderPage("modelops", "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "승인" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "approve_model" }));
});
