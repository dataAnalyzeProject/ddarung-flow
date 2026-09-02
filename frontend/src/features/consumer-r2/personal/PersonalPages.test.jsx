import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PersonalArchivePage from "./PersonalArchivePage";
import PersonalMyPage from "./PersonalMyPage";

const user = { id: "member-1", displayName: "따릉이", provider: "GOOGLE" };

test("archive replays only through current evidence and restores a recent input without stale facts", async () => {
  const onNavigate = jest.fn();
  const onReplay = jest.fn();
  const adapter = { loadArchive: jest.fn().mockResolvedValue({ favorites: [{ id: 1, stationId: 1002, currentStationId: "37-2", stationName: "서울역" }], savedJourneys: [{ savedJourneyId: "saved-1", displayName: "주말 한강" }] }), readRecentSearches: jest.fn().mockReturnValue([{ origin: { providerId: "o", displayName: "서울역" }, destination: { providerId: "d", displayName: "광화문" }, travelMode: "WALK", requiredBikeCount: 2 }]), replaySavedJourney: jest.fn().mockResolvedValue({ decisionId: "decision-1" }) };
  render(<PersonalArchivePage adapter={adapter} onNavigate={onNavigate} onReplay={onReplay} user={user} />);
  await screen.findByText("서울역");
  fireEvent.click(screen.getByRole("button", { name: "현재 정보 보기" }));
  expect(onNavigate).toHaveBeenCalledWith("station", "37-2");
  fireEvent.click(screen.getByRole("tab", { name: /저장한 AI 계획/ }));
  fireEvent.click(screen.getByRole("button", { name: "현재 정보로 다시 계획" }));
  await waitFor(() => expect(onReplay).toHaveBeenCalledWith({ decisionId: "decision-1" }));
  fireEvent.click(screen.getByRole("tab", { name: /최근 검색/ }));
  fireEvent.click(screen.getByRole("button", { name: "같은 조건으로 다시 비교" }));
  expect(onNavigate).toHaveBeenCalledWith("main", { restoreSearch: expect.not.objectContaining({ probability: expect.anything(), inventory: expect.anything(), route: expect.anything() }) });
  expect(screen.queryByText(/예측 이력|적중률|저장 경로/)).not.toBeInTheDocument();
});

test("archive keeps the account boundary and does not load personal data for guests", () => {
  const adapter = { loadArchive: jest.fn(), readRecentSearches: jest.fn() };
  render(<PersonalArchivePage adapter={adapter} authState="anonymous" />);
  expect(screen.getByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
  expect(adapter.loadArchive).not.toHaveBeenCalled();
});

test("archive exposes loading, request failure, and Premium replay failure states accessibly", async () => {
  let finishLoad;
  const loadingAdapter = { loadArchive: jest.fn(() => new Promise((resolve) => { finishLoad = resolve; })), readRecentSearches: jest.fn().mockReturnValue([]) };
  const { rerender } = render(<PersonalArchivePage adapter={loadingAdapter} user={user} />);
  expect(screen.getByRole("status")).toHaveTextContent("보관함을 불러오는 중입니다");
  finishLoad({ favorites: [], savedJourneys: [] });
  await screen.findByText(/즐겨찾는 대여소가 없습니다/);

  const failingAdapter = { loadArchive: jest.fn().mockRejectedValue(new Error("DOWN")), readRecentSearches: jest.fn() };
  rerender(<PersonalArchivePage adapter={failingAdapter} user={user} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("보관함을 불러오지 못했습니다");

  const premiumAdapter = { loadArchive: jest.fn().mockResolvedValue({ favorites: [], savedJourneys: [{ savedJourneyId: "saved-1", displayName: "주말 한강" }] }), readRecentSearches: jest.fn().mockReturnValue([]), replaySavedJourney: jest.fn().mockRejectedValue({ code: "PREMIUM_REQUIRED" }) };
  rerender(<PersonalArchivePage adapter={premiumAdapter} user={user} />);
  fireEvent.click(await screen.findByRole("tab", { name: /저장한 AI 계획/ }));
  fireEvent.click(await screen.findByRole("button", { name: "현재 정보로 다시 계획" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Premium 활성 계정");
});

test("my page exposes account, sandbox premium state, and personal shortcuts", async () => {
  const onNavigate = jest.fn();
  const adapter = { loadMyPage: jest.fn().mockResolvedValue({ authState: "authenticated", user, subscription: { status: "ACTIVE" } }), logout: jest.fn() };
  render(<PersonalMyPage adapter={adapter} onNavigate={onNavigate} />);
  await screen.findByText("Premium 활성");
  expect(screen.getByText(/sandbox 접근 상태입니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /AI 플래너 전체 일정 만들기/ }));
  expect(onNavigate).toHaveBeenCalledWith("planner");
});

test("my page keeps loading, guest, unavailable Premium, and logout failure states distinct", async () => {
  let finishProfile;
  const loadingAdapter = { loadMyPage: jest.fn(() => new Promise((resolve) => { finishProfile = resolve; })), logout: jest.fn() };
  const { rerender } = render(<PersonalMyPage adapter={loadingAdapter} />);
  expect(screen.getByText("계정 상태를 확인하는 중입니다…")).toHaveAttribute("role", "status");
  finishProfile({ authState: "anonymous", user: null, subscription: null });
  expect(await screen.findByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();

  const unavailableAdapter = { loadMyPage: jest.fn().mockResolvedValue({ authState: "authenticated", user, subscription: null, subscriptionError: "PREMIUM_STATUS_UNAVAILABLE" }), logout: jest.fn().mockRejectedValue(new Error("DOWN")) };
  rerender(<PersonalMyPage adapter={unavailableAdapter} />);
  expect(await screen.findByText("Premium 상태를 지금 확인할 수 없습니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("로그아웃하지 못했습니다");
});
