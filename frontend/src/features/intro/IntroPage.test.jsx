import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IntroPage from "./IntroPage";
import { hasSeenIntro, INTRO_SEEN_KEY, markIntroSeen } from "./introStorage";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("서비스 설명과 세 가지 기능 카드를 표시한다", () => {
  render(<IntroPage onComplete={jest.fn()} />);
  expect(screen.getByRole("heading", { name: /출발하기 전에.*도착지.*따릉이\s*부터 볼까요/ })).toBeInTheDocument();
  expect(screen.getByText("도착할 시간에 몇 대가 남아 있을지 미리 알려드려요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" })).toBeInTheDocument();
  expect(screen.getByText("도착 시 대여 가능성 예측")).toBeInTheDocument();
  expect(screen.getByText("추천 대여소와 경로")).toBeInTheDocument();
  expect(screen.getByText("날씨 기반 이동 가이드")).toBeInTheDocument();
  expect(screen.getByText("5초 후 자동으로 대여 예측을 시작합니다.")).toBeInTheDocument();
});

test("도착지 주변 대여소의 예상 대수와 추천 지점을 안내한다", () => {
  render(<IntroPage onComplete={jest.fn()} />);
  const forecast = screen.getByRole("group", { name: "도착 예상 시간 기준 주변 대여소의 예상 자전거 수" });
  expect(forecast).toHaveTextContent("예상 7대");
  expect(forecast).toHaveTextContent("예상 5대");
  expect(forecast).toHaveTextContent("예상 3대");
  expect(forecast).toHaveTextContent("추천");
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

test("주 CTA 완료 직후 남은 타이머를 정리한다", () => {
  const onComplete = jest.fn();
  render(<IntroPage onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" }));
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(5000));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("저장소 쓰기 오류가 발생해도 완료를 막지 않는다", () => {
  const onComplete = jest.fn();
  const storage = { setItem: jest.fn(() => { throw new Error("blocked"); }) };
  render(<IntroPage onComplete={onComplete} storage={storage} />);
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("완료 플래그 저장 함수는 키를 저장하고 실패를 허용한다", () => {
  const storage = { setItem: jest.fn() };
  markIntroSeen(storage);
  expect(storage.setItem).toHaveBeenCalledWith(INTRO_SEEN_KEY, "true");
  expect(() => markIntroSeen({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
});

test("주 CTA는 Enter로 한 번 완료한다", () => {
  const onComplete = jest.fn();
  render(<IntroPage onComplete={onComplete} />);
  screen.getByRole("button", { name: "대여 가능성 예측 시작하기" }).focus();
  expect(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" })).toHaveFocus();
  userEvent.keyboard("{enter}");
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("서비스 이용 방법 링크는 기능 카드로 이동하고 초점을 옮긴다", () => {
  render(<IntroPage onComplete={jest.fn()} />);
  const features = screen.getByLabelText("서비스 이용 방법");
  fireEvent.click(screen.getByRole("link", { name: "서비스 이용 방법" }));
  expect(features).toHaveFocus();
});

test("헤더에 주요 메뉴와 로그인 링크를 제공한다", () => {
  render(<IntroPage onComplete={jest.fn()} />);
  expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toHaveTextContent("대여 예측");
  expect(screen.getByRole("link", { name: "보관함" })).toHaveAttribute("href", "/#archive");
  expect(screen.getByRole("link", { name: "알림" })).toHaveAttribute("href", "/#alerts");
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
});
