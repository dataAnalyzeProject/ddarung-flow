import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerAlertsPage from "./ConsumerAlertsPage";

const FIXED_NOW = new Date(2026, 8, 3, 10, 0, 0);
const searchInput = {
  origin: { providerId: "origin", displayName: "서울역", latitude: 37.55, longitude: 126.97 },
  destination: { providerId: "destination", displayName: "광화문", latitude: 37.57, longitude: 126.98 },
  travelMode: "WALK",
  requiredBikeCount: 2,
};
const notifications = [
  { id: 1, title: "출발 전 재확인 시간이 되었습니다", message: "현재 정보를 확인하세요.", createdAt: "2026-09-03T09:45:00+09:00", readAt: null, group: "recheck", label: "검색 재확인", tone: "info", notificationType: "SEARCH_RECHECK", action: { kind: "recheck", ref: "search-1" } },
  { id: 2, title: "문의에 답변이 등록되었습니다", message: "검색 질문", createdAt: "2026-09-03T09:00:00+09:00", readAt: null, group: "qna", label: "Q&A 답변", tone: "success", notificationType: "QNA_ANSWERED", action: { kind: "qna", ref: "7" } },
  { id: 3, title: "Premium 샌드박스가 활성화되었습니다", message: "상태를 확인하세요.", createdAt: "2026-09-02T09:00:00+09:00", readAt: "2026-09-02T10:00:00+09:00", group: "premium", label: "Premium 활성", tone: "premium", notificationType: "PREMIUM_ACTIVE", action: { kind: "premium", ref: null } },
];

function adapter(overrides = {}) {
  return {
    loadAlerts: jest.fn().mockResolvedValue({ notifications, subscriptions: [{ publicId: "active-1", kind: "SEARCH_RECHECK", status: "ACTIVE", searchInput, departureAt: "2026-09-03T12:00:00+09:00" }] }),
    markRead: jest.fn().mockResolvedValue({ readAt: "2026-09-03T10:01:00+09:00" }),
    markAllRead: jest.fn().mockResolvedValue(null),
    createSearchRecheck: jest.fn().mockResolvedValue({ publicId: "new-search", kind: "SEARCH_RECHECK", status: "ACTIVE", searchInput, departureAt: "2026-09-03T11:00:00+09:00" }),
    createPlanRecheck: jest.fn().mockResolvedValue({ publicId: "new-plan", kind: "PLAN_RECHECK", status: "ACTIVE", savedJourneyId: "saved-1", departureAt: "2026-09-03T11:00:00+09:00" }),
    cancelRecheck: jest.fn().mockResolvedValue(null),
    executeRecheck: jest.fn().mockResolvedValue({ kind: "SEARCH_RECHECK", result: { candidates: [] } }),
    ...overrides,
  };
}

test("renders only event-driven alerts and routes Q&A/Premium actions", async () => {
  const api = adapter();
  const onNavigate = jest.fn();
  render(<ConsumerAlertsPage adapter={api} onNavigate={onNavigate} />);
  expect(await screen.findByText("출발 전 재확인 시간이 되었습니다")).toBeInTheDocument();
  expect(screen.getByText("문의에 답변이 등록되었습니다")).toBeInTheDocument();
  expect(screen.getByText("Premium 샌드박스가 활성화되었습니다")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "출발 전 재확인 알림을 상징하는 벨 일러스트" })).toHaveAttribute("src", expect.stringContaining("cr22-alert-reminder-bell-v1.webp"));
  expect(screen.queryByText(/임계값|재고 이하|stationId|예측 확률|날씨 스냅샷|경로 스냅샷/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "답변 보기" }));
  expect(onNavigate).toHaveBeenCalledWith("qna", { questionId: "7" });
  fireEvent.click(screen.getByRole("button", { name: "Premium 상태 보기" }));
  expect(onNavigate).toHaveBeenCalledWith("premium");
});

test("supports mark-read, mark-all, filtering, and cancelling an active opt-in", async () => {
  const api = adapter();
  render(<ConsumerAlertsPage adapter={api} />);
  await screen.findByText("출발 전 재확인 시간이 되었습니다");
  fireEvent.click(screen.getByRole("button", { name: /출발 전 재확인 시간이 되었습니다 알림 읽음 처리/ }));
  await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(1));
  fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
  await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "알림 취소" }));
  await waitFor(() => expect(api.cancelRecheck).toHaveBeenCalledWith("active-1"));
  expect(await screen.findByText("취소됨")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Q&A" }));
  expect(screen.getByText("문의에 답변이 등록되었습니다")).toBeInTheDocument();
  expect(screen.queryByText("Premium 샌드박스가 활성화되었습니다")).not.toBeInTheDocument();
});

test("creates search and plan recheck opt-ins with only the selected departure time", async () => {
  const api = adapter();
  render(<ConsumerAlertsPage adapter={api} now={() => FIXED_NOW} savedJourneyId="saved-1" searchInput={searchInput} />);
  await screen.findByRole("heading", { name: "출발 전 재확인" });
  fireEvent.click(screen.getByRole("button", { name: "현재 검색 알림 받기" }));
  fireEvent.change(screen.getByLabelText(/출발 시각/), { target: { value: "2026-09-03T11:00" } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  await waitFor(() => expect(api.createSearchRecheck).toHaveBeenCalledWith(searchInput, new Date(2026, 8, 3, 11, 0).toISOString()));
  expect(await screen.findByText("출발 15분 전 재확인 알림을 신청했습니다.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "저장한 계획 알림 받기" }));
  fireEvent.change(screen.getByLabelText(/출발 시각/), { target: { value: "2026-09-03T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  await waitFor(() => expect(api.createPlanRecheck).toHaveBeenCalledWith("saved-1", new Date(2026, 8, 3, 12, 0).toISOString()));
});

test("executes recheck by publicId and forwards only the current-data response", async () => {
  const api = adapter({ loadAlerts: jest.fn().mockResolvedValue({ notifications, subscriptions: [{ publicId: "search-1", kind: "SEARCH_RECHECK", status: "FIRED", searchInput }] }) });
  const onCurrentData = jest.fn();
  render(<ConsumerAlertsPage adapter={api} onCurrentData={onCurrentData} />);
  await screen.findByText("출발 전 재확인 시간이 되었습니다");
  fireEvent.click(screen.getByRole("button", { name: "현재 정보 다시 확인" }));
  await waitFor(() => expect(api.executeRecheck).toHaveBeenCalledWith("search-1"));
  expect(onCurrentData).toHaveBeenCalledWith({ kind: "SEARCH_RECHECK", result: { candidates: [] } }, searchInput);
  expect(screen.queryByText(/저장 당시|과거 확률|과거 재고|과거 경로|과거 날씨/)).not.toBeInTheDocument();
});

test("keeps auth, loading, empty, and error states distinct", async () => {
  const guestApi = adapter();
  const { rerender } = render(<ConsumerAlertsPage adapter={guestApi} authState="anonymous" />);
  expect(screen.getByRole("alert")).toHaveTextContent("로그인이 필요합니다");
  expect(guestApi.loadAlerts).not.toHaveBeenCalled();

  let resolveAlerts;
  const loadingApi = adapter({ loadAlerts: jest.fn(() => new Promise((resolve) => { resolveAlerts = resolve; })) });
  rerender(<ConsumerAlertsPage adapter={loadingApi} />);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  resolveAlerts({ notifications: [], subscriptions: [] });
  expect(await screen.findByRole("heading", { name: "새 알림이 없습니다" })).toBeInTheDocument();

  const failingApi = adapter({ loadAlerts: jest.fn().mockRejectedValue(new Error("DOWN")) });
  rerender(<ConsumerAlertsPage adapter={failingApi} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("알림을 불러오지 못했습니다");
});

test("clears private alerts and ignores a late response when authentication ends", async () => {
  let resolveAlerts;
  const api = adapter({ loadAlerts: jest.fn(() => new Promise((resolve) => { resolveAlerts = resolve; })) });
  const { rerender } = render(<ConsumerAlertsPage adapter={api} searchInput={searchInput} />);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  rerender(<ConsumerAlertsPage adapter={api} authState="anonymous" searchInput={searchInput} />);
  expect(screen.getByRole("alert")).toHaveTextContent("로그인이 필요합니다");
  resolveAlerts({ notifications, subscriptions: [{ publicId: "private-subscription", kind: "SEARCH_RECHECK", status: "ACTIVE", searchInput }] });
  await waitFor(() => expect(screen.queryByText("문의에 답변이 등록되었습니다")).not.toBeInTheDocument());
  expect(screen.queryByText("private-subscription")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "출발 전 재확인" })).not.toBeInTheDocument();
});
