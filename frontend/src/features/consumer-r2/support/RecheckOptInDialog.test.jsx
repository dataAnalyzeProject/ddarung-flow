import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecheckOptInDialog, { validateDepartureAt } from "./RecheckOptInDialog";

const FIXED_NOW = new Date(2026, 8, 3, 10, 0, 0);

test("rejects a SEARCH_RECHECK departure earlier than the fixed 15 minute lead", () => {
  expect(validateDepartureAt("2026-09-03T10:14", FIXED_NOW)).toContain("15분 이후");
  expect(validateDepartureAt("2026-09-03T10:15", FIXED_NOW)).toBe("");
});

test("rounds the displayed minimum up so the browser does not offer an invalid minute", () => {
  const nowWithSeconds = new Date(2026, 8, 3, 10, 0, 30);
  render(<RecheckOptInDialog now={() => nowWithSeconds} onClose={jest.fn()} onConfirm={jest.fn()} open />);
  expect(screen.getByLabelText(/출발 시각/)).toHaveAttribute("min", "2026-09-03T10:16");
});

test("starts with an empty departure time instead of a silent default, and names the 15-minute alert lead", async () => {
  const onConfirm = jest.fn();
  render(<RecheckOptInDialog now={() => FIXED_NOW} onClose={jest.fn()} onConfirm={onConfirm} open />);
  const input = screen.getByLabelText(/출발 시각/);
  expect(input).toHaveValue("");
  expect(screen.getByText(/직접 탈 예정인 출발 시각을 입력해 주세요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("출발 시각을 입력해 주세요.");
  expect(onConfirm).not.toHaveBeenCalled();
});

test("requests only departureAt and returns an ISO time", async () => {
  const onConfirm = jest.fn();
  render(<RecheckOptInDialog now={() => FIXED_NOW} onClose={jest.fn()} onConfirm={onConfirm} open />);
  const input = screen.getByLabelText(/출발 시각/);
  fireEvent.change(input, { target: { value: "2026-09-03T10:14" } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("15분 이후");
  fireEvent.change(input, { target: { value: "2026-09-03T10:30" } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  expect(onConfirm).toHaveBeenCalledWith(new Date("2026-09-03T10:30").toISOString());
  expect(screen.queryByLabelText(/대여소|확률|재고|날씨|경로/)).not.toBeInTheDocument();
});

test("traps focus, closes with Escape, and restores the opener", async () => {
  const onClose = jest.fn();
  function Fixture({ open = true }) {
    return <><button type="button">열기</button><RecheckOptInDialog now={() => FIXED_NOW} onClose={onClose} onConfirm={jest.fn()} open={open} /></>;
  }
  const { rerender } = render(<Fixture open={false} />);
  const opener = screen.getByRole("button", { name: "열기" });
  opener.focus();
  rerender(<Fixture />);
  expect(document.body).toHaveStyle({ overflow: "hidden" });
  await waitFor(() => expect(screen.getByLabelText(/출발 시각/)).toHaveFocus());
  const close = screen.getByRole("button", { name: "재확인 신청 닫기" });
  const submit = screen.getByRole("button", { name: "15분 전 알림 받기" });
  submit.focus();
  fireEvent.keyDown(submit, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(submit).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).toHaveBeenCalled();
  rerender(<Fixture open={false} />);
  expect(document.body.style.overflow).toBe("");
  expect(opener).toHaveFocus();
});
