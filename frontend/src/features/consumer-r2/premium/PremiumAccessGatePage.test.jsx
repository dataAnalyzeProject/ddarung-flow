import { fireEvent, render, screen } from "@testing-library/react";
import PremiumAccessGatePage from "./PremiumAccessGatePage";

describe("PremiumAccessGatePage", () => {
  it("keeps free functionality and the sandbox Premium boundary explicit", () => {
    render(<PremiumAccessGatePage />);
    expect(screen.getByRole("heading", { name: /AI 기능은 Premium 전용/ })).toBeInTheDocument();
    expect(screen.getByText(/Premium은 따릉이 이용권이 아니라/)).toBeInTheDocument();
    expect(screen.getByText("대여 가능성 비교")).toBeInTheDocument();
    expect(screen.getByText("AI Planner")).toBeInTheDocument();
  });

  it("routes anonymous, free, and active users to distinct actions", () => {
    const onLogin = jest.fn();
    const onOpenCheckout = jest.fn();
    const onOpenPremium = jest.fn();
    const { rerender } = render(<PremiumAccessGatePage authState="anonymous" onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: "로그인하고 Premium 보기" }));
    expect(onLogin).toHaveBeenCalledTimes(1);

    rerender(<PremiumAccessGatePage accessState="FREE" onOpenCheckout={onOpenCheckout} />);
    fireEvent.click(screen.getByRole("button", { name: "Premium 테스트 플랜 보기" }));
    expect(onOpenCheckout).toHaveBeenCalledTimes(1);

    rerender(<PremiumAccessGatePage accessState="ACTIVE" onOpenPremium={onOpenPremium} />);
    fireEvent.click(screen.getByRole("button", { name: "Premium AI 기능 열기" }));
    expect(onOpenPremium).toHaveBeenCalledTimes(1);
  });

  it("shows processing, expired, and error states without claiming entitlement", () => {
    const { rerender } = render(<PremiumAccessGatePage accessState="PROCESSING" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sandbox 결제 결과");
    expect(screen.getByRole("button", { name: "상태 확인 중…" })).toBeDisabled();

    rerender(<PremiumAccessGatePage accessState="EXPIRED" />);
    expect(screen.getByRole("status")).toHaveTextContent("Premium 만료");

    rerender(<PremiumAccessGatePage accessState="ERROR" />);
    expect(screen.getByRole("status")).toHaveTextContent("상태 확인 실패");
  });
});
