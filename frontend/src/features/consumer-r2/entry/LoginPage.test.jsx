import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./LoginPage.jsx";
import { AUTH_PRESENTATION_STATE } from "../adapters/auth/index.js";

function createAdapter(overrides = {}) {
  return {
    checkSession: jest.fn(() => Promise.resolve({ authenticated: false, user: null })),
    startSocialLogin: jest.fn(),
    logout: jest.fn(() => Promise.resolve()),
    loadPendingPrediction: jest.fn(() => null),
    clearPendingPrediction: jest.fn(),
    resolveLoginReturnState: jest.fn(() => null),
    ...overrides,
  };
}

test("waiting state exposes the three real provider choices and preserves OAuth provider names", () => {
  const adapter = createAdapter();
  const { container } = render(<LoginPage adapter={adapter} initialStatus={AUTH_PRESENTATION_STATE.WAITING} />);

  expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "네이버로 계속하기" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toBeInTheDocument();
  expect(container.querySelector(".cr22-login__mobility-strip img")).toHaveAttribute("alt", "");
  expect(container.querySelector(".cr22-login__mobility-strip img")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector(".cr22-login__mobility-strip img")).toHaveAttribute("width", "1600");

  fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
  expect(adapter.startSocialLogin).toHaveBeenCalledWith("Kakao");
  expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeDisabled();
});

test.each([
  [AUTH_PRESENTATION_STATE.FAILED, "alert", "로그인에 실패했습니다"],
  [AUTH_PRESENTATION_STATE.CANCELLED, "status", "로그인이 취소되었습니다"],
])("%s presentation keeps its distinct recovery state", (state, role, message) => {
  render(<LoginPage adapter={createAdapter()} initialStatus={state} />);
  expect(screen.getByRole(role)).toHaveTextContent(message);
  expect(screen.getByRole("button", { name: "네이버로 계속하기" })).not.toBeDisabled();
});

test("successful session preserves pending Main input and links to its existing restoration query", () => {
  const pending = {
    origin: "서울역",
    destination: "광화문",
    travelMode: "WALK",
    directMinutes: null,
    requiredBikeCount: 2,
  };
  const adapter = createAdapter({ loadPendingPrediction: jest.fn(() => pending) });

  render(<LoginPage adapter={adapter} initialStatus={AUTH_PRESENTATION_STATE.SUCCESS} />);

  expect(screen.getByText("서울역")).toBeInTheDocument();
  expect(screen.getByText("광화문")).toBeInTheDocument();
  expect(screen.getByText("이동수단으로 계산")).toBeInTheDocument();
  expect(screen.getByText("2대")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /입력 이어서 예측하기/ })).toHaveAttribute("href", "/?login=success");
  expect(adapter.clearPendingPrediction).not.toHaveBeenCalled();
});

test("callback-based repeat passes the restored object once and clears it after handoff", () => {
  const pending = { origin: "서울역", destination: "광화문", travelMode: "WALK", requiredBikeCount: 2 };
  const adapter = createAdapter({ loadPendingPrediction: jest.fn(() => pending) });
  const onRepeatPrediction = jest.fn();

  render(
    <LoginPage
      adapter={adapter}
      initialStatus={AUTH_PRESENTATION_STATE.SUCCESS}
      onRepeatPrediction={onRepeatPrediction}
    />,
  );

  const repeatButton = screen.getByRole("button", { name: /입력 이어서 예측하기/ });
  fireEvent.click(repeatButton);
  fireEvent.click(repeatButton);

  expect(onRepeatPrediction).toHaveBeenCalledTimes(1);
  expect(onRepeatPrediction).toHaveBeenCalledWith(pending);
  expect(adapter.clearPendingPrediction).toHaveBeenCalledTimes(1);
});

test("page-show restoration releases a provider request left loading by OAuth back navigation", () => {
  const adapter = createAdapter();
  render(<LoginPage adapter={adapter} initialStatus={AUTH_PRESENTATION_STATE.LOADING} />);

  const pageShow = new Event("pageshow");
  Object.defineProperty(pageShow, "persisted", { value: true });
  act(() => window.dispatchEvent(pageShow));

  expect(screen.getByRole("button", { name: "Google로 계속하기" })).not.toBeDisabled();
});

test("default load maps a cancelled OAuth return before checking the session", async () => {
  const adapter = createAdapter({
    resolveLoginReturnState: jest.fn(() => AUTH_PRESENTATION_STATE.CANCELLED),
  });

  render(<LoginPage adapter={adapter} />);

  expect(await screen.findByRole("status")).toHaveTextContent("로그인이 취소되었습니다");
  expect(adapter.checkSession).not.toHaveBeenCalled();
});

test("authenticated session renders success and logout returns to provider choices", async () => {
  const adapter = createAdapter({
    checkSession: jest.fn(() => Promise.resolve({ authenticated: true, user: { displayName: "김따릉", provider: "Kakao" } })),
  });

  render(<LoginPage adapter={adapter} />);
  expect(await screen.findByRole("heading", { name: "김따릉님, 환영합니다" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("로그아웃되었습니다"));
  expect(adapter.logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toBeInTheDocument();
});
