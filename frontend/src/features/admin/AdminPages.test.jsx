import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPages";
import { answerQuestion, hideQuestion, listAdminQuestions } from "./qnaAdminApi";
import { changeAdminUserRole, listAdminUsers } from "./adminUsersApi";

jest.mock("./qnaAdminApi", () => ({
  listAdminQuestions: jest.fn(),
  answerQuestion: jest.fn(),
  hideQuestion: jest.fn(),
}));
jest.mock("./adminUsersApi", () => ({
  listAdminUsers: jest.fn(),
  changeAdminUserRole: jest.fn(),
}));

const qnaPage = { items: [{ id: 104, title: "Q&A 질문", body: "질문 내용", category: "SERVICE", visibility: "PUBLIC", status: "PENDING", answers: [] }] };

beforeEach(() => {
  listAdminQuestions.mockResolvedValue(qnaPage);
  answerQuestion.mockResolvedValue({});
  hideQuestion.mockResolvedValue({});
  listAdminUsers.mockResolvedValue({ items: [{ userId: "00000000-0000-0000-0000-000000000001", displayName: "관리자", role: "ADMIN" }], page: 0, size: 20, total: 1 });
  changeAdminUserRole.mockResolvedValue({});
});

const renderPage = (menuId, actorRole, onAction = jest.fn()) => {
  render(<AdminPage menuId={menuId} actorRole={actorRole} onAction={onAction} />);
  return onAction;
};

test("admin sends export callback without confirming success", () => {
  const onAction = renderPage("export", "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "Export 요청" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "export_request" }));
  expect(screen.queryByText("요청 완료")).not.toBeInTheDocument();
});

test("users menu loads the API and changes a selected user's role", async () => {
  renderPage("users", "ADMIN");
  expect(await screen.findByText("관리자")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "역할 변경" }));
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(changeAdminUserRole).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "역할 변경" }));
  fireEvent.change(screen.getByRole("textbox", { name: "변경 사유" }), { target: { value: "운영 권한 조정" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 확인" }));
  await waitFor(() => expect(changeAdminUserRole).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", "USER", "운영 권한 조정"));
});

test("users menu distinguishes an unauthenticated API response", async () => {
  listAdminUsers.mockRejectedValueOnce({ status: 401 });
  renderPage("users", "ADMIN");
  expect(await screen.findByText("로그인이 필요합니다")).toBeInTheDocument();
});

test("users menu shows loading, empty, and retry states", async () => {
  let resolveFirstLoad;
  listAdminUsers.mockImplementationOnce(() => new Promise((resolve) => { resolveFirstLoad = resolve; }));
  listAdminUsers.mockResolvedValueOnce({ items: [{ userId: "00000000-0000-0000-0000-000000000002", displayName: "재시도 사용자", role: "USER" }], page: 0, size: 20, total: 1 });

  renderPage("users", "ADMIN");
  expect(screen.getByRole("heading", { name: "불러오는 중" })).toBeInTheDocument();
  resolveFirstLoad({ items: [], page: 0, size: 20, total: 0 });
  expect(await screen.findByText("표시할 fixture가 없습니다")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("재시도 사용자")).toBeInTheDocument();
});

test("users menu distinguishes a forbidden API response", async () => {
  listAdminUsers.mockRejectedValueOnce({ status: 403 });
  renderPage("users", "ADMIN");
  expect(await screen.findByText("관리자 권한이 필요합니다")).toBeInTheDocument();
});

test("users menu distinguishes role-change 404 and 409 responses", async () => {
  changeAdminUserRole.mockRejectedValueOnce({ status: 404 });
  changeAdminUserRole.mockRejectedValueOnce({ code: "LAST_SUPER_ADMIN_REQUIRED" });
  renderPage("users", "ADMIN");
  await screen.findByText("관리자");

  fireEvent.click(screen.getByRole("button", { name: "역할 변경" }));
  fireEvent.change(screen.getByRole("textbox", { name: "변경 사유" }), { target: { value: "없는 사용자 확인" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 확인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("사용자를 찾을 수 없습니다.");

  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  fireEvent.click(screen.getByRole("button", { name: "역할 변경" }));
  fireEvent.change(screen.getByRole("textbox", { name: "변경 사유" }), { target: { value: "마지막 관리자 확인" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 확인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("마지막 ADMIN의 역할은 낮출 수 없습니다.");
});

test("admin loads an API question and sends its answer", async () => {
  renderPage("qna", "ADMIN");
  expect(await screen.findByRole("button", { name: "Q&A 질문" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "답변 내용" }), { target: { value: "답변 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith(104, "답변 내용"));
});

test("admin can hide an API question", async () => {
  render(<AdminPage menuId="qna" actorRole="ADMIN" />);
  fireEvent.click(await screen.findByRole("button", { name: "숨김" }));
  await waitFor(() => expect(hideQuestion).toHaveBeenCalledWith(104));
});

test("admin Q&A 목록에서 상세로 이동해 답변과 숨김 API를 호출한 뒤 목록으로 돌아간다", async () => {
  renderPage("qna", "ADMIN");

  fireEvent.click(await screen.findByRole("button", { name: "Q&A 질문" }));
  expect(screen.getByRole("heading", { name: "관리자 / Q&A 관리 / 104" })).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: "답변 내용" }), { target: { value: "답변 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith(104, "답변 내용"));

  fireEvent.click(screen.getByRole("button", { name: "목록으로 돌아가기" }));
  expect(await screen.findByRole("button", { name: "Q&A 질문" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Q&A 질문" }));
  fireEvent.click(screen.getByRole("button", { name: "숨김" }));
  await waitFor(() => expect(hideQuestion).toHaveBeenCalledWith(104));
  expect(await screen.findByRole("button", { name: "Q&A 질문" })).toBeInTheDocument();
});

test("qna overview shows the API result count", async () => {
  renderPage("qna", "ADMIN");
  expect(await screen.findByText("문의 목록 · 1건")).toBeInTheDocument();
});

test("admin may approve model", () => {
  const onAction = renderPage("modelops", "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "승인" }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "approve_model" }));
});
