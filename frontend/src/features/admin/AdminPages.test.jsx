import { fireEvent, render, screen } from "@testing-library/react";
import { AdminPage } from "./AdminPages";

const renderPage = (menuId, actorRole, onAction = jest.fn()) => {
  render(<AdminPage menuId={menuId} actorRole={actorRole} onAction={onAction} />);
  return onAction;
};

test("operator sends export callback without confirming success", () => {
  const onAction = renderPage("export", "ADMIN_OPERATOR");
  fireEvent.click(screen.getByRole("button", { name: "Export 요청" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "export_request" }));
  expect(screen.queryByText("요청 완료")).not.toBeInTheDocument();
});

test("role change dialog can cancel and protects last super admin", () => {
  const onAction = renderPage("users", "SUPER_ADMIN");
  fireEvent.click(screen.getAllByRole("button", { name: "역할 변경" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "역할 변경" })[1]);
  fireEvent.click(screen.getByRole("button", { name: "변경 확인" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "change_role" }));
  expect(screen.getByText("마지막 SUPER_ADMIN 역할은 이 fixture에서 변경할 수 없습니다.")).toBeInTheDocument();
});

test("operator can answer and close public qna", () => {
  const onAction = renderPage("qna", "ADMIN_OPERATOR");
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  fireEvent.click(screen.getByRole("button", { name: "종료" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "answer_qna", questionId: "Q-104" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "change_qna_state", nextState: "CLOSED" }));
});

test("private question text is protected and only super admin can hide", () => {
  const { rerender } = render(<AdminPage menuId="qna" actorRole="ADMIN_OPERATOR" />);
  expect(screen.getByText("PRIVATE 문의 원문과 개인정보는 관리자 fixture에서 표시하지 않습니다.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "숨김" })).not.toBeInTheDocument();
  rerender(<AdminPage menuId="qna" actorRole="SUPER_ADMIN" onAction={jest.fn()} />);
  expect(screen.getByRole("button", { name: "숨김" })).toBeInTheDocument();
});

test("qna overview keeps eight fixture rows and the state transition guide", () => {
  renderPage("qna", "ADMIN_READER");
  expect(screen.getByText("문의 목록 · 8건")).toBeInTheDocument();
  expect(screen.getByText(/OPEN.*ANSWERED.*CLOSED/)).toBeInTheDocument();
});

test("approver may approve model but has no qna page", () => {
  const onAction = renderPage("modelops", "MODEL_APPROVER");
  fireEvent.click(screen.getByRole("button", { name: "승인" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "approve_model" }));
});
