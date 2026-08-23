import { fireEvent, render, screen } from "@testing-library/react";
import AdminApp from "./AdminApp";

test("menus call back and admin sees dashboard fixture", () => {
  const onAction = jest.fn();
  render(<AdminApp actorRole="ADMIN" onAction={onAction} />);
  expect(screen.getByRole("heading", { name: "운영 현황" })).toBeInTheDocument();
  ["서비스 상태", "데이터 신선도", "활성 모델", "최근 실패"].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /ModelOps/ }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "menu", menuId: "modelops" }));
  expect(screen.getByRole("heading", { name: "ModelOps" })).toBeInTheDocument();
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

test("admin can view Q&A", () => {
  render(<AdminApp actorRole="ADMIN" activeMenuId="qna" />);
  expect(screen.getByRole("heading", { name: "Q&A 관리" })).toBeInTheDocument();
});
