import { fireEvent, render, screen } from "@testing-library/react";
import AdminApp from "./AdminApp";

test("menus call back and reader sees dashboard fixture", () => {
  const onAction = jest.fn();
  render(<AdminApp actorRole="ADMIN_READER" onAction={onAction} />);
  expect(screen.getByRole("heading", { name: "운영 현황" })).toBeInTheDocument();
  ["서비스 상태", "데이터 신선도", "활성 모델", "최근 실패"].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /ModelOps/ }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "menu", menuId: "modelops" }));
});

test.each(["loading", "empty", "error"])('renders common %s state', (viewState) => {
  render(<AdminApp actorRole="ADMIN_READER" viewState={viewState} />);
  expect(screen.getByTestId(`admin-${viewState}`)).toBeInTheDocument();
});

test("user never receives admin fixture content", () => {
  render(<AdminApp actorRole="USER" />);
  expect(screen.getByTestId("admin-forbidden")).toBeInTheDocument();
  expect(screen.queryByText("운영 현황")).not.toBeInTheDocument();
});

test("model approver cannot view Q&A", () => {
  render(<AdminApp actorRole="MODEL_APPROVER" activeMenuId="qna" />);
  expect(screen.getByTestId("admin-forbidden")).toBeInTheDocument();
});
