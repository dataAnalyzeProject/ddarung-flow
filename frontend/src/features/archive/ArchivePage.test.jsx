import { fireEvent, render, screen } from "@testing-library/react";
import ArchivePage from "./ArchivePage";

test("renders the saved stations tab by default", () => {
  render(<ArchivePage />);

  expect(screen.getByRole("heading", { name: "내 보관함" })).toBeInTheDocument();
  expect(screen.getByText("성수역 3번 출구")).toBeInTheDocument();
  expect(screen.getByText("성수동 카페거리")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "저장 대여소", selected: true })).toBeInTheDocument();
});

test("switching to the routes tab shows the placeholder card", () => {
  render(<ArchivePage />);

  fireEvent.click(screen.getByRole("tab", { name: "저장 경로" }));

  expect(screen.getByText("저장 경로 준비 중")).toBeInTheDocument();
  expect(screen.queryByText("성수역 3번 출구")).not.toBeInTheDocument();
});

test("removing a saved station updates the summary count", () => {
  render(<ArchivePage />);

  fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]);

  expect(screen.queryByText("성수역 3번 출구")).not.toBeInTheDocument();
  expect(screen.getByText("성수동 카페거리")).toBeInTheDocument();
});
