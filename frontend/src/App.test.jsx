import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App, { navigationTarget } from "./App";
import { getCurrentUser } from "./features/login/authApi";
import { INTRO_SEEN_KEY } from "./features/intro/introStorage";
import { fetchStationDetail, fetchStationRhythm } from "./features/station-detail/stationRhythmApi";

jest.mock("./features/login/authApi", () => ({
  getCurrentUser: jest.fn(() => Promise.resolve({ authenticated: false, user: null })),
  logout: jest.fn(() => Promise.resolve()),
  startSocialLogin: jest.fn(),
}));
jest.mock("./features/station-detail/stationRhythmApi", () => ({ fetchStationDetail: jest.fn(), fetchStationRhythm: jest.fn() }));

beforeEach(() => {
  window.localStorage.clear();
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  fetchStationDetail.mockResolvedValue({ stationName: "대여소 테스트", availableBikeCount: 1, inventoryStatus: "NORMAL" });
  fetchStationRhythm.mockRejectedValue(new Error("RHYTHM_NOT_AVAILABLE"));
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.REACT_APP_JOURNEY_ENABLED;
});

test.each([
  ['unset planner', undefined, '/#journey'],
  ['false planner', 'false', '/#journey'],
  ['TRUE planner', 'TRUE', '/#journey'],
  ['1 planner', '1', '/#journey'],
  ['unset result', undefined, '/#journey/result/decision-1'],
])('keeps %s Journey hash route on the main screen while the feature is off', async (_label, flag, path) => {
  if (flag !== undefined) process.env.REACT_APP_JOURNEY_ENABLED = flag;
  window.history.replaceState({}, '', path);
  window.localStorage.setItem(INTRO_SEEN_KEY, 'true');

  render(<App />);

  await waitFor(() => expect(document.querySelector('.main-shell')).toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: '여정 조건을 입력하세요' })).not.toBeInTheDocument();
  expect(screen.queryByText('여정을 불러오는 중입니다.')).not.toBeInTheDocument();
});

test('renders the Journey planner only when the feature is explicitly enabled', async () => {
  process.env.REACT_APP_JOURNEY_ENABLED = 'true';
  window.history.replaceState({}, '', '/#journey');
  window.localStorage.setItem(INTRO_SEEN_KEY, 'true');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '여정 조건을 입력하세요' })).toBeInTheDocument();
});

test('does not create a Journey hash through programmatic navigation while the feature is off', () => {
  expect(navigationTarget('journey')).toEqual({ hash: '', route: 'main', stationId: null });
  expect(navigationTarget('journey-result', 'decision-1')).toEqual({ hash: '', route: 'main', stationId: null });
});

test("shows the selected draft 6 as the main page", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  await waitFor(() => {
    expect(document.querySelector(".main-shell")).toBeInTheDocument();
  });
});

test("renders the station hash route and keeps the station id", async () => {
  window.history.replaceState({}, "", "/#station/ST-10");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: true, user: { displayName: "사용자" } });
  render(<App />);
  expect(await screen.findByRole("heading", { name: /대여소 테스트/ })).toBeInTheDocument();
  expect(fetchStationDetail).toHaveBeenCalledWith("ST-10");
});

test("shows the existing login page at the login URL", async () => {
  window.history.replaceState({}, "", "/login");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  expect(await screen.findByTitle(/Kakao/i)).toBeInTheDocument();
});

test("does not render the admin fixture for a USER at the direct admin URL", async () => {
  window.history.replaceState({}, "", "/admin");
  getCurrentUser.mockResolvedValue({ authenticated: true, user: { role: "USER" } });

  render(<App />);

  expect(await screen.findByTestId("admin-access-forbidden")).toBeInTheDocument();
  expect(screen.queryByText("운영 현황")).not.toBeInTheDocument();
});

test("renders the fixture-only admin preview without checking a session outside production", () => {
  window.history.replaceState({}, "", "/?adminPreview=1");

  render(<App />);

  expect(screen.getByRole("heading", { name: "운영 현황" })).toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test('renders the admin-v2 OPS preview without checking a session', async () => {
  window.history.replaceState({}, '', '/admin-v2-preview/ops?fixture=OPS_VIEWER');

  render(<App />);

  expect(await screen.findByText('UI-OPS-01')).toBeInTheDocument();
  expect(screen.getByText('FIXTURE / API_NOT_CONNECTED')).toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test('redirects the admin-v2 root to the permitted model route and preserves its query', async () => {
  window.history.replaceState({}, '', '/admin-v2-preview?fixture=MODEL_ENGINEER');

  render(<App />);

  await waitFor(() => expect(window.location.pathname).toBe('/admin-v2-preview/models'));
  expect(window.location.search).toBe('?fixture=MODEL_ENGINEER');
  expect(screen.getByText('UI-MODEL-01')).toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test('renders forbidden admin-v2 routes without auth or domain placeholder data', async () => {
  window.history.replaceState({}, '', '/admin-v2-preview/models/releases?fixture=OPS_VIEWER');

  render(<App />);

  expect(await screen.findByText('ADMIN_PERMISSION_DENIED')).toBeInTheDocument();
  expect(screen.queryByText('UI-MODEL-04')).not.toBeInTheDocument();
  expect(screen.queryByText('FIXTURE / API_NOT_CONNECTED')).not.toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test("shows the intro before the main page on the first visit", async () => {
  window.history.replaceState({}, "", "/");

  render(<App />);

  expect(screen.getByRole("button", { name: "대여 가능성 예측 시작하기" })).toBeInTheDocument();
  expect(document.querySelector(".intro-page")).toBeInTheDocument();
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
});

test("moves to the main page without reloading after completing the intro", async () => {
  window.history.replaceState({}, "", "/");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(screen.getByRole("button"));

  expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("true");
  await waitFor(() => {
    expect(document.querySelector(".main-shell")).toBeInTheDocument();
  });
});

test("continues to the main page when intro storage is unavailable", async () => {
  window.history.replaceState({}, "", "/");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });

  render(<App />);
  fireEvent.click(screen.getByRole("button"));

  await waitFor(() => {
    expect(document.querySelector(".main-shell")).toBeInTheDocument();
  });
});

test("opens Q&A from the main menu without a full-page reload and reflects the hash", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Q&A" }));

  expect(window.location.hash).toBe("#qna");
  expect(screen.getByRole("heading", { name: "Q&A" })).toBeInTheDocument();
  expect(document.querySelector(".qna-shell")).toBeInTheDocument();
});

test("brand button returns from Q&A to the prediction main page", async () => {
  window.history.replaceState({}, "", "/#qna");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "대여 예측 메인으로 이동" }));

  expect(window.location.hash).toBe("");
  await waitFor(() => expect(document.querySelector(".main-shell")).toBeInTheDocument());
});

test("opens the archive page from the main menu and reflects the hash", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "보관함" }));

  expect(window.location.hash).toBe("#archive");
  expect(screen.getByRole("heading", { name: "내 보관함" })).toBeInTheDocument();
});

test("opens the alerts page from the main menu and reflects the hash", async () => {
  window.history.replaceState({}, "", "/");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "알림" }));

  expect(window.location.hash).toBe("#alerts");
  expect(screen.getByRole("heading", { name: "알림" })).toBeInTheDocument();
});

test("shares the logged-in header state across Q&A, archive, and alerts", async () => {
  window.history.replaceState({}, "", "/#qna");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({
    authenticated: true,
    user: { displayName: "김따릉", provider: "kakao" },
  });

  render(<App />);

  expect(await screen.findByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "김따릉 · 내 계정" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "보관함" }));
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "알림" }));
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  expect(getCurrentUser).toHaveBeenCalledTimes(1);
});

test("shows the mypage guest notice when navigating there while logged out", async () => {
  window.history.replaceState({}, "", "/#mypage");
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  getCurrentUser.mockResolvedValue({ authenticated: false, user: null });

  render(<App />);

  expect(await screen.findByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
});
