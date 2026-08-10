import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IntroPage from "./IntroPage";
import { hasSeenIntro, INTRO_SEEN_KEY, markIntroSeen } from "./introStorage";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("서비스 설명과 예측 기준을 표시한다", () => {
  render(<IntroPage onComplete={jest.fn()} />);
  expect(screen.getByRole("heading", { name: /도착할 때 빌릴 수 있는/ })).toBeInTheDocument();
  expect(screen.getByText("도착시간 기준")).toBeInTheDocument();
  expect(screen.getByText("필요 수량")).toBeInTheDocument();
  expect(screen.getByText("높음·중간·낮음")).toBeInTheDocument();
});

test("5초 뒤 완료 플래그를 저장하고 한 번 완료한다", () => {
  const onComplete = jest.fn();
  const storage = { getItem: jest.fn(), setItem: jest.fn() };
  render(<IntroPage onComplete={onComplete} storage={storage} />);
  act(() => jest.advanceTimersByTime(5000));
  expect(storage.setItem).toHaveBeenCalledWith(INTRO_SEEN_KEY, "true");
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("바로 시작하기는 즉시 완료하고 남은 타이머는 다시 완료하지 않는다", () => {
  const onComplete = jest.fn();
  render(<IntroPage onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "바로 시작하기" }));
  act(() => jest.advanceTimersByTime(5000));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("키보드 Enter로 바로 시작할 수 있다", () => {
  const onComplete = jest.fn();
  const button = render(<IntroPage onComplete={onComplete} />).getByRole("button", { name: "바로 시작하기" });
  button.focus();
  userEvent.keyboard("{enter}");
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("저장소 오류가 발생해도 완료를 막지 않는다", () => {
  const onComplete = jest.fn();
  const storage = { setItem: jest.fn(() => { throw new Error("blocked"); }) };
  render(<IntroPage onComplete={onComplete} storage={storage} />);
  fireEvent.click(screen.getByRole("button", { name: "바로 시작하기" }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("완료 플래그와 저장소 읽기 실패를 안전하게 판단한다", () => {
  expect(hasSeenIntro({ getItem: () => "true" })).toBe(true);
  expect(hasSeenIntro({ getItem: () => null })).toBe(false);
  expect(hasSeenIntro({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
  expect(() => markIntroSeen({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
});
