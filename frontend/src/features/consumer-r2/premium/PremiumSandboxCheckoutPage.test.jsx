import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumSandboxCheckoutPage from "./PremiumSandboxCheckoutPage";

const plans = [
  { id: "PREMIUM_MONTHLY_30D", duration: "30일", name: "30일 Premium 테스트 플랜", price: "2,900원", policy: "자동 갱신 없음", featured: false },
  { id: "PREMIUM_YEARLY_365D", duration: "365일", name: "365일 Premium 테스트 플랜", price: "29,000원", policy: "자동 갱신 없음", featured: true },
];

function createAdapter(overrides = {}) {
  return {
    plans,
    start: jest.fn().mockResolvedValue({ orderId: "order-1", amount: 2900, customerKey: "customer-1", currency: "KRW" }),
    openCheckout: jest.fn().mockResolvedValue({}),
    confirm: jest.fn().mockResolvedValue({ status: "ACTIVE" }),
    load: jest.fn().mockResolvedValue({ status: "ACTIVE" }),
    ...overrides,
  };
}

describe("PremiumSandboxCheckoutPage", () => {
  beforeEach(() => window.history.replaceState({}, "", "/"));

  it("labels the screen as a non-commercial sandbox and exposes both plans", () => {
    render(<PremiumSandboxCheckoutPage adapter={createAdapter()} />);
    expect(screen.getByText(/실제 따릉이 이용권 구매가 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/Toss Payments 샌드박스 계정으로만/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30일 플랜 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "365일 플랜 선택" })).toBeInTheDocument();
  });

  it("reuses the adapter checkout flow and returns to free after cancellation", async () => {
    let cancel;
    const adapter = createAdapter({ openCheckout: jest.fn((_checkout, callbacks) => { cancel = callbacks.onCancel; return Promise.resolve(); }) });
    render(<PremiumSandboxCheckoutPage adapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "30일 플랜 선택" }));
    await waitFor(() => expect(adapter.start).toHaveBeenCalledWith("PREMIUM_MONTHLY_30D"));
    act(() => cancel());
    expect(await screen.findByText(/실제 과금은 발생하지 않았습니다/)).toBeInTheDocument();
  });

  it("shows a recoverable error when sandbox checkout cannot start", async () => {
    const adapter = createAdapter({ start: jest.fn().mockRejectedValue(new Error("PAYMENT_NOT_ENABLED")) });
    render(<PremiumSandboxCheckoutPage adapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "365일 플랜 선택" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("테스트 키 설정");
  });

  it("confirms callback payment before presenting active access", async () => {
    window.history.replaceState({}, "", "/?payment=processing&paymentKey=key&orderId=order&amount=2900#premium");
    const adapter = createAdapter();
    render(<PremiumSandboxCheckoutPage adapter={adapter} />);
    await waitFor(() => expect(adapter.confirm).toHaveBeenCalledWith({ paymentKey: "key", orderId: "order", amount: "2900" }));
    expect(await screen.findByText(/Premium 접근 상태가 활성화/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Premium 활성" })).toHaveLength(2);
  });

  it("does not claim active access when callback refresh returns a non-active state", async () => {
    window.history.replaceState({}, "", "/?payment=processing&paymentKey=key&orderId=order&amount=2900#premium");
    const onSuccess = jest.fn();
    const adapter = createAdapter({ load: jest.fn().mockResolvedValue({ status: "EXPIRED" }) });
    render(<PremiumSandboxCheckoutPage adapter={adapter} onSuccess={onSuccess} />);
    expect(await screen.findByText(/아직 활성화되지 않았습니다/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("shows a failed Toss return as an error and clears callback parameters", async () => {
    window.history.replaceState({}, "", "/?payment=failed&code=PAYMENT_FAILED#premium");
    render(<PremiumSandboxCheckoutPage adapter={createAdapter()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sandbox 결제가 완료되지 않았습니다");
    expect(window.location.search).toBe("");
  });

  it("clears callback parameters when confirmation fails", async () => {
    window.history.replaceState({}, "", "/?payment=processing&paymentKey=bad&orderId=order&amount=2900#premium");
    const adapter = createAdapter({ confirm: jest.fn().mockRejectedValue(new Error("PAYMENT_VERIFICATION_FAILED")) });
    render(<PremiumSandboxCheckoutPage adapter={adapter} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("승인 상태를 확인하지 못했습니다");
    expect(window.location.search).toBe("");
  });

  it("keeps expired access visibly separate from active access", () => {
    render(<PremiumSandboxCheckoutPage accessState="EXPIRED" adapter={createAdapter()} />);
    expect(screen.getByRole("status")).toHaveTextContent("접근 기간 만료");
    expect(screen.queryByText(/접근 상태가 활성화/)).not.toBeInTheDocument();
  });

  it("renders anonymous and subscription lookup failures as separate states", () => {
    const { rerender } = render(<PremiumSandboxCheckoutPage authState="anonymous" adapter={createAdapter()} />);
    expect(screen.getByRole("status")).toHaveTextContent("먼저 로그인");

    rerender(<PremiumSandboxCheckoutPage accessState="ERROR" adapter={createAdapter()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("접근 상태를 불러오지 못했습니다");
  });

  it("clears stale active and error messages when access returns to free", () => {
    const adapter = createAdapter();
    const { rerender } = render(<PremiumSandboxCheckoutPage accessState="ACTIVE" adapter={adapter} />);
    expect(screen.getByRole("status")).toHaveTextContent("접근 상태가 활성화");

    rerender(<PremiumSandboxCheckoutPage accessState="FREE" adapter={adapter} />);
    expect(screen.queryByText(/접근 상태가 활성화/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30일 플랜 선택" })).toBeInTheDocument();

    rerender(<PremiumSandboxCheckoutPage accessState="ERROR" adapter={adapter} />);
    expect(screen.getByRole("alert")).toHaveTextContent("접근 상태를 불러오지 못했습니다");

    rerender(<PremiumSandboxCheckoutPage accessState="FREE" adapter={adapter} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "365일 플랜 선택" })).toBeInTheDocument();
  });
});
