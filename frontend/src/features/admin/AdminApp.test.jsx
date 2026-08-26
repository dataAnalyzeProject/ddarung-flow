import { fireEvent, render, screen } from "@testing-library/react";
import AdminApp from "./AdminApp";
import { listAdminQuestions } from "./qnaAdminApi";
import { listAdminModels } from "./adminModelOpsApi";

jest.mock("./qnaAdminApi", () => ({
  listAdminQuestions: jest.fn(),
  answerQuestion: jest.fn(),
  hideQuestion: jest.fn(),
}));
jest.mock("./adminModelOpsApi", () => ({
  listAdminModels: jest.fn(),
  validateAdminModel: jest.fn(),
  approveAdminModel: jest.fn(),
  activateAdminModel: jest.fn(),
  rollbackAdminModel: jest.fn(),
}));

test("menus call back and admin sees the unavailable dashboard notice", async () => {
  listAdminModels.mockResolvedValue([]);
  const onAction = jest.fn();
  render(<AdminApp actorRole="ADMIN" onAction={onAction} />);
  expect(screen.getByRole("heading", { name: "운영 현황" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "운영 현황 API 준비 중" })).toBeInTheDocument();
  expect(screen.queryByText("서비스 상태")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /ModelOps/ }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "menu", menuId: "modelops" }));
  expect(await screen.findByRole("heading", { name: "ModelOps" })).toBeInTheDocument();
});

test.each(["loading", "empty", "error"])('renders common %s state', (viewState) => {
  render(<AdminApp actorRole="ADMIN" viewState={viewState} />);
  expect(screen.getByTestId(`admin-${viewState}`)).toBeInTheDocument();
});

test("user never receives admin fixture content", () => {
  render(<AdminApp actorRole="USER" />);
  expect(screen.getByTestId("admin-forbidden")).toBeInTheDocument();
  expect(screen.queryByText("운영 현황")).not.toBeInTheDocument();
});

test("admin can view Q&A", async () => {
  listAdminQuestions.mockResolvedValue({
    items: [{ id: 1, title: "대여소 문의", body: "문의 내용", category: "USAGE", visibility: "PUBLIC", status: "PENDING", answers: [] }],
  });
  render(<AdminApp actorRole="ADMIN" activeMenuId="qna" />);
  expect(await screen.findByRole("heading", { name: "Q&A 관리" })).toBeInTheDocument();
});
