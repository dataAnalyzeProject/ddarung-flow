import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { getCurrentUser } from "./features/login/authApi";
import { INTRO_SEEN_KEY } from "./features/intro/introStorage";

jest.mock("./features/login/authApi", () => ({
  getCurrentUser: jest.fn(() => Promise.resolve({ authenticated: false, user: null })),
  logout: jest.fn(() => Promise.resolve()),
  startSocialLogin: jest.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("shows the selected draft 6 as the main page", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  await waitFor(() => {
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
  });
});

test("shows the existing login page at the login URL", async () => {
  window.history.replaceState({}, "", "/login");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  expect(await screen.findByTitle(/Kakao/i)).toBeInTheDocument();
});

test("shows the intro before the main page on the first visit", () => {
  window.history.replaceState({}, "", "/");

  render(<App />);

  expect(screen.getByRole("button")).toBeInTheDocument();
  expect(document.querySelector('a[href="/login"]')).not.toBeInTheDocument();
});

test("moves to the main page without reloading after completing the intro", async () => {
  window.history.replaceState({}, "", "/");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(screen.getByRole("button"));

  expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("true");
  await waitFor(() => {
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
  });
});

test("continues to the main page when intro storage is unavailable", async () => {
  window.history.replaceState({}, "", "/");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });

  render(<App />);
  fireEvent.click(screen.getByRole("button"));

  await waitFor(() => {
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
  });
});
