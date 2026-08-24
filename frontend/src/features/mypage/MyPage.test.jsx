import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MyPage from "./MyPage";
import { getCurrentUser } from "../login/authApi";

jest.mock("../login/authApi", () => ({
  getCurrentUser: jest.fn(),
  logout: jest.fn(() => Promise.resolve()),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

test("shows the profile card when the user is authenticated", async () => {
  getCurrentUser.mockResolvedValue({
    authenticated: true,
    user: { displayName: "김따릉", provider: "GOOGLE" },
  });

  render(<MyPage />);

  await waitFor(() => {
    expect(screen.getByText("김따릉", { selector: ".mypage-name" })).toBeInTheDocument();
  });
  expect(screen.getByText("GOOGLE")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /내 Q&A/ })).toBeInTheDocument();
});

test("shows a guest notice when the user is not authenticated", async () => {
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<MyPage />);

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
  });
  expect(screen.getByRole("link", { name: "로그인하러 가기" })).toHaveAttribute("href", "/login");
});

test("shows the admin console entry only to ADMIN and uses the existing route", async () => {
  getCurrentUser.mockResolvedValue({
    authenticated: true,
    user: { displayName: "관리자", provider: "KAKAO", role: "ADMIN" },
  });
  const onNavigate = jest.fn();

  render(<MyPage onNavigate={onNavigate} />);

  fireEvent.click(await screen.findByRole("button", { name: /관리자 콘솔/ }));
  expect(onNavigate).toHaveBeenCalledWith("admin");
});

test("does not show the admin console entry to USER", async () => {
  getCurrentUser.mockResolvedValue({
    authenticated: true,
    user: { displayName: "일반 사용자", provider: "KAKAO", role: "USER" },
  });

  render(<MyPage />);

  await screen.findByText("일반 사용자", { selector: ".mypage-name" });
  expect(screen.queryByRole("button", { name: /관리자 콘솔/ })).not.toBeInTheDocument();
});
