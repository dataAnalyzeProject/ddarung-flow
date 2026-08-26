import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPages";
import { answerQuestion, hideQuestion, listAdminQuestions } from "./qnaAdminApi";
import { changeAdminUserRole, listAdminUsers } from "./adminUsersApi";
import { listAdminAuditLogs } from "./adminAuditLogsApi";
import { createAdminExport, downloadAdminExport, listAdminExports } from "./adminExportsApi";
import { activateAdminModel, approveAdminModel, listAdminModels, rollbackAdminModel, validateAdminModel } from "./adminModelOpsApi";
import { getAdminOverview } from "./adminOverviewApi";
import { getAdminPerformance } from "./adminPerformanceApi";

jest.mock("./qnaAdminApi", () => ({
  listAdminQuestions: jest.fn(),
  answerQuestion: jest.fn(),
  hideQuestion: jest.fn(),
}));
jest.mock("./adminUsersApi", () => ({
  listAdminUsers: jest.fn(),
  changeAdminUserRole: jest.fn(),
}));
jest.mock("./adminAuditLogsApi", () => ({ listAdminAuditLogs: jest.fn() }));
jest.mock("./adminExportsApi", () => ({
  listAdminExports: jest.fn(),
  createAdminExport: jest.fn(),
  downloadAdminExport: jest.fn(),
}));
jest.mock("./adminModelOpsApi", () => ({ listAdminModels: jest.fn(), validateAdminModel: jest.fn(), approveAdminModel: jest.fn(), activateAdminModel: jest.fn(), rollbackAdminModel: jest.fn() }));
jest.mock("./adminOverviewApi", () => ({ getAdminOverview: jest.fn() }));
jest.mock("./adminPerformanceApi", () => ({ getAdminPerformance: jest.fn() }));

const qnaPage = { items: [{ id: 104, title: "Q&A 질문", body: "질문 내용", category: "SERVICE", visibility: "PUBLIC", status: "PENDING", answers: [] }] };

beforeEach(() => {
  listAdminQuestions.mockResolvedValue(qnaPage);
  answerQuestion.mockResolvedValue({});
  hideQuestion.mockResolvedValue({});
  listAdminUsers.mockResolvedValue({ items: [{ userId: "00000000-0000-0000-0000-000000000001", displayName: "관리자", role: "ADMIN" }], page: 0, size: 20, total: 1 });
  changeAdminUserRole.mockResolvedValue({});
  listAdminAuditLogs.mockResolvedValue({ items: [{ action: "ROLE_CHANGE", targetType: "USER", targetId: "public-user", actorRole: "ADMIN", result: "SUCCESS", reasonCode: "ROLE_CHANGED", correlationId: "audit-1", occurredAt: "2026-08-26T10:00:00+09:00" }], page: 0, size: 20, total: 1 });
  listAdminExports.mockResolvedValue({ items: [{ exportId: 7, source: "CURATED", format: "CSV", status: "COMPLETED", rowCount: 2 }] });
  createAdminExport.mockResolvedValue({ exportId: 8, status: "COMPLETED" });
  downloadAdminExport.mockResolvedValue(new Blob());
  listAdminModels.mockResolvedValue([{ id: 1, version: "v17", state: "ACTIVE", createdAt: "2026-08-26T10:00:00+09:00" }, { id: 2, version: "v18", state: "APPROVED", createdAt: "2026-08-26T10:01:00+09:00" }]);
  validateAdminModel.mockResolvedValue({}); approveAdminModel.mockResolvedValue({}); activateAdminModel.mockResolvedValue({}); rollbackAdminModel.mockResolvedValue({});
  getAdminOverview.mockResolvedValue({ serviceStatus: "NORMAL", dataFreshness: { ageMinutes: 12, status: "NORMAL" }, activeModel: { state: "NONE" }, pending: { exports: 1, modelApprovals: 2, qnaUnanswered: 3 } });
  getAdminPerformance.mockResolvedValue({ combinations: Array.from({ length: 20 }, (_, index) => ({ horizonMinutes: 60, requiredBikeCount: index + 1, sampleCount: 1000, brierScore: 0.03 })), calibrationBins: [{ binLowerPercent: 0, actualRate: .1 }], segments: [{ axis: "HOUR_BUCKET_X_STATION_SIZE", segmentValue: "COMMUTE_AM:SMALL", sampleCount: 1000, brierScore: .06, skillScore: .1, status: "OK" }] });
});

const renderPage = (menuId, actorRole, onAction = jest.fn()) => {
  render(<AdminPage menuId={menuId} actorRole={actorRole} onAction={onAction} />);
  return onAction;
};

test("dashboard shows API operating data instead of fixture data", async () => {
  renderPage("dashboard", "ADMIN");
  expect((await screen.findAllByText("NORMAL")).length).toBeGreaterThan(0);
  expect(screen.getByText("평가 artifact ceeccc… · 현재 서비스 운영 모델과 다를 수 있습니다")).toBeInTheDocument();
});

test("dashboard keeps the page when model performance is not yet available", async () => {
  getAdminPerformance.mockRejectedValueOnce({ status: 404 });
  renderPage("dashboard", "ADMIN");
  expect(await screen.findByText("평가 결과가 아직 없습니다")).toBeInTheDocument();
  expect(screen.getAllByText("NORMAL").length).toBeGreaterThan(0);
});

test("dashboard keeps stat cards when overview loading fails", async () => {
  getAdminOverview.mockRejectedValueOnce({ status: 500, code: "INTERNAL_ERROR" });
  renderPage("dashboard", "ADMIN");
  expect((await screen.findAllByText("불러오지 못함")).length).toBeGreaterThan(0);
  expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();
});

test("admin export menu uses the actual adapter for request and download", async () => {
  renderPage("export", "ADMIN");
  expect(await screen.findByText("COMPLETED")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Export 요청" }));
  await waitFor(() => expect(createAdminExport).toHaveBeenCalledWith(expect.objectContaining({ source: "CURATED", format: "CSV", rowCount: 1000 })));
  fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  await waitFor(() => expect(downloadAdminExport).toHaveBeenCalledWith(7));
});

test("admin export menu distinguishes empty, unauthorized, forbidden, and retry states", async () => {
  listAdminExports.mockResolvedValueOnce({ items: [] }).mockRejectedValueOnce({ status: 401 }).mockRejectedValueOnce({ status: 403 }).mockResolvedValueOnce({ items: [{ exportId: 9, source: "CURATED", format: "CSV", status: "COMPLETED", rowCount: 1 }] });
  const { unmount } = render(<AdminPage menuId="export" actorRole="ADMIN" />);
  expect(await screen.findByText("표시할 항목이 없습니다")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("로그인이 필요합니다")).toBeInTheDocument();
  unmount();
  render(<AdminPage menuId="export" actorRole="ADMIN" />);
  expect(await screen.findByText("관리자 권한이 필요합니다")).toBeInTheDocument();
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

test("users menu sends the search query to the API", async () => {
  listAdminUsers.mockResolvedValueOnce({ items: [{ userId: "00000000-0000-0000-0000-000000000001", displayName: "관리자", role: "ADMIN" }], page: 0, size: 20, total: 1 });
  listAdminUsers.mockResolvedValueOnce({ items: [{ userId: "00000000-0000-0000-0000-000000000002", displayName: "검색 결과", role: "USER" }], page: 0, size: 20, total: 1 });
  renderPage("users", "ADMIN");
  await screen.findByText("관리자");

  fireEvent.change(screen.getByRole("textbox", { name: "사용자 검색" }), { target: { value: "검색 결과" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));

  await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ q: "검색 결과" }));
  expect(await screen.findByText("검색 결과")).toBeInTheDocument();
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
  expect(await screen.findByText("표시할 항목이 없습니다")).toBeInTheDocument();

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

test("audit menu loads API rows and sends filters", async () => {
  renderPage("audit", "ADMIN");
  expect(await screen.findByText("ROLE_CHANGE")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "행위 필터" }), { target: { value: "ROLE_CHANGE" } });
  fireEvent.change(screen.getByRole("combobox", { name: "결과 필터" }), { target: { value: "SUCCESS" } });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
  await waitFor(() => expect(listAdminAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ action: "ROLE_CHANGE", result: "SUCCESS", page: 0 })));
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

test("modelops menu uses the actual adapter for activation and rollback", async () => {
  renderPage("modelops", "ADMIN");
  expect(await screen.findByText("v18")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "활성화" }));
  await waitFor(() => expect(activateAdminModel).toHaveBeenCalledWith(2));
  await waitFor(() => expect(listAdminModels).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "이전 ACTIVE로 롤백" }));
  await waitFor(() => expect(rollbackAdminModel).toHaveBeenCalled());
});
