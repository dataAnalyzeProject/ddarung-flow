import { fireEvent, render, screen } from "@testing-library/react";
import { ExportDetail, QnaAnswerDetail } from "./AdminDetailViews";

test("완료 Export에서만 다운로드 callback을 호출하고 목록으로 돌아간다", () => {
  const onBack = jest.fn(); const onDownload = jest.fn();
  render(<ExportDetail item={{ id: "EXP-1", type: "집계", requester: "ADMIN", state: "완료", progress: 100 }} onBack={onBack} onDownload={onDownload} />);
  fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "EXP-1" }));
  fireEvent.click(screen.getByRole("button", { name: "목록으로 돌아가기" }));
  expect(onBack).toHaveBeenCalled();
});

test("실패와 만료 Export는 안내를 표시하고 다운로드를 숨긴다", () => {
  const { rerender } = render(<ExportDetail item={{ id: "EXP-2", type: "집계", requester: "ADMIN", state: "실패", progress: 30, reason: "생성 실패" }} onBack={jest.fn()} onDownload={jest.fn()} />);
  expect(screen.getByText("안내: 생성 실패")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다운로드" })).not.toBeInTheDocument();
  rerender(<ExportDetail item={{ id: "EXP-3", type: "집계", requester: "ADMIN", state: "만료", progress: 100 }} onBack={jest.fn()} onDownload={jest.fn()} />);
  expect(screen.getByText("안내: 새 Export 요청이 필요합니다.")).toBeInTheDocument();
});

test("대기와 생성 중 Export는 상태를 표시하고 다운로드를 숨긴다", () => {
  const { rerender } = render(<ExportDetail item={{ id: "EXP-4", type: "집계", requester: "ADMIN", state: "대기", progress: 0 }} onBack={jest.fn()} onDownload={jest.fn()} />);
  expect(screen.getByText("상태: 대기")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다운로드" })).not.toBeInTheDocument();

  rerender(<ExportDetail item={{ id: "EXP-5", type: "집계", requester: "ADMIN", state: "생성 중", progress: 68 }} onBack={jest.fn()} onDownload={jest.fn()} />);
  expect(screen.getByText("상태: 생성 중")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다운로드" })).not.toBeInTheDocument();
});

test("PRIVATE Q&A는 OPEN 표시와 답변 및 숨김 callback을 제공한다", () => {
  const onAnswer = jest.fn(); const onHide = jest.fn(); const onAnswerChange = jest.fn();
  render(<QnaAnswerDetail question={{ id: 12, title: "비공개 질문", body: "본문", category: "ACCOUNT", visibility: "PRIVATE", status: "PENDING", answers: [] }} answer="답변" onAnswerChange={onAnswerChange} onAnswer={onAnswer} onHide={onHide} onBack={jest.fn()} />);
  expect(screen.getByText(/상태: OPEN/)).toBeInTheDocument();
  expect(screen.getByText("PRIVATE 문의는 권한 있는 ADMIN만 처리합니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  fireEvent.click(screen.getByRole("button", { name: "숨김" }));
  expect(onAnswer).toHaveBeenCalled();
  expect(onHide).toHaveBeenCalled();
});
