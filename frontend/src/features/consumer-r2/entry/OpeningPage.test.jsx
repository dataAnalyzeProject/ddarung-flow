import { act, fireEvent, render, screen } from "@testing-library/react";
import OpeningPage from "./OpeningPage.jsx";
import { INTRO_SEEN_KEY } from "../../intro/introStorage.js";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  window.localStorage.clear();
});

test("presents the approved opening hierarchy and starts only on the CTA", () => {
  const onStart = jest.fn();

  const { container } = render(<OpeningPage onStart={onStart} />);

  expect(screen.getByRole("heading", { name: /도착하기 전에.*따릉이 대여 가능성.*확인하세요/ })).toBeInTheDocument();
  expect(container.querySelector(".cr22-opening__visual > img")).toHaveAttribute("alt", "");
  expect(container.querySelector(".cr22-opening__visual > img")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector(".cr22-opening__visual > img")).toHaveAttribute("width", "1600");
  expect(screen.getByText("도착지 주변 대여소 비교")).toBeInTheDocument();
  expect(screen.getByText("주변 대여소의 대여 가능성을 한눈에 비교해요")).toBeInTheDocument();

  expect(onStart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" }));
  expect(onStart).toHaveBeenCalledTimes(1);
});

test("waiting on the landing never advances on its own", () => {
  const onStart = jest.fn();

  render(<OpeningPage onStart={onStart} />);

  act(() => jest.advanceTimersByTime(5000));
  expect(onStart).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(30000));
  expect(onStart).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: /도착하기 전에.*확인하세요/ })).toBeInTheDocument();
});

test("no auto-advance copy and no visit-dependent CTA branch remain", () => {
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");

  render(<OpeningPage onStart={jest.fn()} />);

  // A returning visitor sees the same landing, with the same CTA, and no countdown promise.
  expect(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "대여 예측 다시 시작하기" })).not.toBeInTheDocument();
  expect(screen.queryByText(/자동으로/)).not.toBeInTheDocument();
  expect(screen.queryByText(/초 후/)).not.toBeInTheDocument();
});

test("the landing header carries real navigation and account intent instead of decoration", () => {
  const onNavigate = jest.fn();
  const onLogin = jest.fn();

  render(<OpeningPage authState="anonymous" onLogin={onLogin} onNavigate={onNavigate} onStart={jest.fn()} />);

  expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");

  fireEvent.click(screen.getByRole("button", { name: "라이딩" }));
  expect(onNavigate).toHaveBeenCalledWith("ride");

  fireEvent.click(screen.getByRole("link", { name: /보관함/ }));
  expect(onNavigate).toHaveBeenCalledWith("archive");

  fireEvent.click(screen.getByRole("link", { name: /Q&A/ }));
  expect(onNavigate).toHaveBeenCalledWith("qna");

  fireEvent.click(screen.getByRole("button", { name: /알림/ }));
  expect(onNavigate).toHaveBeenCalledWith("alerts");

  fireEvent.click(screen.getByRole("link", { name: /로그인/ }));
  expect(onLogin).toHaveBeenCalledTimes(1);
});

test("an authenticated visitor reaches the account from the landing header", () => {
  const onNavigate = jest.fn();

  render(<OpeningPage authState="authenticated" onNavigate={onNavigate} onStart={jest.fn()} user={{ displayName: "사용자", tier: "PREMIUM" }} />);

  fireEvent.click(screen.getByRole("link", { name: /사용자/ }));
  expect(onNavigate).toHaveBeenCalledWith("mypage");
});
