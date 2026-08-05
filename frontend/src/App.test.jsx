import { render, screen } from "@testing-library/react";
import App from "./App";
import { getCurrentUser } from './features/login/authApi';

jest.mock('./features/login/authApi', () => ({
  getCurrentUser: jest.fn(() => Promise.resolve({ authenticated: false, user: null })),
  logout: jest.fn(() => Promise.resolve()),
  startSocialLogin: jest.fn(),
}));

test("shows the selected draft 6 as the main page", async () => {
  window.history.replaceState({}, "", "/");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  render(<App />);
  expect(screen.getByText(/도착할 때 빌릴 수 있는 따릉이/i)).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
});

test("shows the existing login page at the login URL", async () => {
  window.history.replaceState({}, "", "/login");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  render(<App />);
  expect(await screen.findByTitle(/Kakao 로그인/i)).toBeInTheDocument();
});
