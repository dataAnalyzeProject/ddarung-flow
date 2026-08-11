import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IntroPage from "./IntroPage";
import { hasSeenIntro, INTRO_SEEN_KEY, markIntroSeen } from "./introStorage";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("서비스 설명과 도착 대여 가능성 예시를 표시한다", () => {
  render(<IntroPage onComplete={jest.fn()} />);
  expect(screen.getByRole("heading", { name: /도착할 때 빌릴 수 있는/ })).toBeInTheDocument();
  expect(screen.getByLabelText("도착 대여 가능성 예시")).toBeInTheDocument();
  expect(screen.getByText("화면 예시 · 실제 데이터가 아닙니다.")).toBeInTheDocument();
  expect(screen.getByText("5초 후 자동으로 시작합니다.")).toBeInTheDocument();
});

test("완료 플래그 유무와 읽기 실패를 안전하게 판단한다", () => {
  expect(hasSeenIntro({ getItem: () => null })).toBe(false);
  expect(hasSeenIntro({ getItem: () => "true" })).toBe(true);
  expect(hasSeenIntro({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
});

test("5초 뒤 완료 플래그를 저장하고 onComplete를 한 번 호출한다", () => {
  const onComplete = jest.fn();
  const storage = { getItem: jest.fn(), setItem: jest.fn() };
  render(<IntroPage onComplete={onComplete} storage={storage} />);
  act(() => jest.advanceTimersByTime(5000));
  expect(storage.setItem).toHaveBeenCalledWith(INTRO_SEEN_KEY, "true");
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("바로 시작하기 완료 직후 남은 타이머를 정리한다", () => {
  const onComplete = jest.fn();
  render(<IntroPage onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "바로 시작하기" }));
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(5000));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("저장소 쓰기 오류가 발생해도 완료를 막지 않는다", () => {
  const onComplete = jest.fn();
  const storage = { setItem: jest.fn(() => { throw new Error("blocked"); }) };
  render(<IntroPage onComplete={onComplete} storage={storage} />);
  fireEvent.click(screen.getByRole("button", { name: "바로 시작하기" }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("완료 플래그 저장 함수는 키를 저장하고 실패를 허용한다", () => {
  const storage = { setItem: jest.fn() };
  markIntroSeen(storage);
  expect(storage.setItem).toHaveBeenCalledWith(INTRO_SEEN_KEY, "true");
  expect(() => markIntroSeen({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
});

test("Tab으로 버튼에 이동한 뒤 Enter로 한 번 완료한다", () => {
  const onComplete = jest.fn();
  render(<IntroPage onComplete={onComplete} />);
  userEvent.tab();
  expect(screen.getByRole("button", { name: "바로 시작하기" })).toHaveFocus();
  userEvent.keyboard("{enter}");
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
