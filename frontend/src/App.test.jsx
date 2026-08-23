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
    expect(document.querySelector(".main-shell")).toBeInTheDocument();
  });
});

test("shows the existing login page at the login URL", async () => {
  window.history.replaceState({}, "", "/login");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  expect(await screen.findByTitle(/Kakao/i)).toBeInTheDocument();
});

test("does not render the admin fixture for a USER at the direct admin URL", async () => {
  window.history.replaceState({}, "", "/admin");
  getCurrentUser.mockResolvedValue({ authenticated: true, user: { role: "USER" } });

  render(<App />);

  expect(await screen.findByTestId("admin-access-forbidden")).toBeInTheDocument();
  expect(screen.queryByText("운영 현황")).not.toBeInTheDocument();
});

test("shows the intro before the main page on the first visit", () => {
  window.history.replaceState({}, "", "/");

  render(<App />);

  expect(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" })).toBeInTheDocument();
  expect(document.querySelector(".intro-page")).toBeInTheDocument();
});

test("moves to the main page without reloading after completing the intro", async () => {
  window.history.replaceState({}, "", "/");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(screen.getByRole("button"));

  expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("true");
  await waitFor(() => {
    expect(document.querySelector(".main-shell")).toBeInTheDocument();
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
    expect(document.querySelector(".main-shell")).toBeInTheDocument();
  });
});

test("opens Q&A from the main menu without a full-page reload and reflects the hash", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Q&A" }));

  expect(window.location.hash).toBe("#qna");
  expect(screen.getByRole("heading", { name: "Q&A" })).toBeInTheDocument();
  expect(document.querySelector(".qna-shell")).toBeInTheDocument();
});

test("brand button returns from Q&A to the prediction main page", async () => {
  window.history.replaceState({}, "", "/#qna");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "대여 예측 메인으로 이동" }));

  expect(window.location.hash).toBe("");
  await waitFor(() => expect(document.querySelector(".main-shell")).toBeInTheDocument());
});

test("opens the archive page from the main menu and reflects the hash", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "보관함" }));

  expect(window.location.hash).toBe("#archive");
  expect(screen.getByRole("heading", { name: "내 보관함" })).toBeInTheDocument();
});

test("opens the alerts page from the main menu and reflects the hash", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "알림" }));

  expect(window.location.hash).toBe("#alerts");
  expect(screen.getByRole("heading", { name: "알림" })).toBeInTheDocument();
});

test("shows the mypage guest notice when navigating there while logged out", async () => {
  window.history.replaceState({}, "", "/#mypage");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  expect(await screen.findByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
});
