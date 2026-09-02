import { act, fireEvent, render, screen } from "@testing-library/react";
import OpeningPage from "./OpeningPage.jsx";
import { INTRO_SEEN_KEY } from "../../intro/introStorage.js";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("first visit presents the approved opening hierarchy and completes once", () => {
  const onComplete = jest.fn();
  const storage = { getItem: jest.fn(() => null), setItem: jest.fn() };

  const { container } = render(<OpeningPage onComplete={onComplete} storage={storage} />);

  expect(screen.getByRole("heading", { name: /도착하기 전에.*따릉이 대여 가능성.*확인하세요/ })).toBeInTheDocument();
  expect(container.querySelector(".cr22-opening__visual > img")).toHaveAttribute("alt", "");
  expect(container.querySelector(".cr22-opening__visual > img")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector(".cr22-opening__visual > img")).toHaveAttribute("width", "1600");
  expect(screen.getByText("도착지 주변 대여소 비교")).toBeInTheDocument();
  expect(screen.getByText("주변 대여소의 대여 가능성을 한눈에 비교해요")).toBeInTheDocument();
  expect(screen.getByText("5초 후 자동으로 대여 예측을 시작합니다.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" }));
  act(() => jest.advanceTimersByTime(5000));

  expect(storage.setItem).toHaveBeenCalledWith(INTRO_SEEN_KEY, "true");
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("revisit keeps control with the user and does not auto-advance", () => {
  const onComplete = jest.fn();
  const storage = { getItem: jest.fn(() => "true"), setItem: jest.fn() };

  render(<OpeningPage onComplete={onComplete} storage={storage} />);
  expect(screen.getByRole("button", { name: "대여 예측 다시 시작하기" })).toBeInTheDocument();
  expect(screen.getByText("이전에 안내를 확인했어요. 준비되면 바로 시작하세요.")).toBeInTheDocument();

  act(() => jest.advanceTimersByTime(5000));
  expect(onComplete).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "대여 예측 다시 시작하기" }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
