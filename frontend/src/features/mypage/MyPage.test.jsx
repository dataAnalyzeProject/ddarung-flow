import { render, screen, waitFor } from "@testing-library/react";
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
