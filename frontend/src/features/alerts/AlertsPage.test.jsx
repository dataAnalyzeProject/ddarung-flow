import { fireEvent, render, screen } from "@testing-library/react";
import AlertsPage from "./AlertsPage";

test("renders the fixture notifications and rules", () => {
  render(<AlertsPage />);

  expect(screen.getByRole("heading", { name: "알림" })).toBeInTheDocument();
  expect(screen.getByText("저장 대여소의 도착 대여 가능성이 높아요")).toBeInTheDocument();
  expect(screen.getByText("데이터 업데이트 안내")).toBeInTheDocument();
  expect(screen.getByText("2개 사용 중")).toBeInTheDocument();
});

test("marking a notification read updates its pill and the unread count", () => {
  render(<AlertsPage />);

  expect(screen.getByText("2")).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "저장 대여소의 도착 대여 가능성이 높아요 읽음 처리" })
  );

  expect(screen.getByText("1")).toBeInTheDocument();
});

test("모두 읽음 clears every unread pill", () => {
  render(<AlertsPage />);

  fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));

  expect(document.querySelectorAll(".read-pill.unread")).toHaveLength(0);
});

test("toggling a rule switch flips its aria-checked state", () => {
  render(<AlertsPage />);

  const ruleSwitch = screen.getByRole("switch", { name: "도착 가능성 높음" });
  expect(ruleSwitch).toHaveAttribute("aria-checked", "true");

  fireEvent.click(ruleSwitch);
  expect(ruleSwitch).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText("1개 사용 중")).toBeInTheDocument();
});
