import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ArchivePage from "./ArchivePage";
import { predictionHistoryScoreFixture } from "./data/archiveFixture";

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.restoreAllMocks(); });

test("loads the logged-in user's archive data instead of fixtures", async () => {
  global.fetch.mockResolvedValueOnce(response([{ id: 1, stationId: 10, stationName: "성수역 3번 출구" }]))
    .mockResolvedValueOnce(response([{ id: 2, startStationName: "성수역", endStationName: "서울숲" }]))
    .mockResolvedValueOnce(response({ items: [{ id: 3, queryCondition: "DIRECT", summaryResult: "추천 결과 1건" }], scoreSummary: null }));
  render(<ArchivePage />);
  expect(await screen.findByText("성수역 3번 출구")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "저장 경로" }));
  expect(await screen.findByText("성수역 → 서울숲")).toBeInTheDocument();
});

test("shows an API failure message", async () => {
  global.fetch.mockResolvedValueOnce(response({ code: "AUTH_REQUIRED" }, 401));
  render(<ArchivePage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("보관함을 불러오지 못했습니다.");
});

test("deleting a favorite uses the CSRF token then removes only that item", async () => {
  global.fetch.mockResolvedValueOnce(response([{ id: 1, stationId: 10, stationName: "성수역" }]))
    .mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ items: [], scoreSummary: null }))
    .mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "csrf" })).mockResolvedValueOnce(response(null, 204));
  render(<ArchivePage />);
  fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
  await waitFor(() => expect(screen.queryByText("성수역")).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/favorites/1", expect.objectContaining({ method: "DELETE" }));
});

test("replayable saved route restores only its input before returning to the main screen", async () => {
  const onNavigate = jest.fn();
  global.fetch.mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([{ id: 2, displayName: "서울역 → 광화문", replayable: true, routeInput: { kind: "ROUTE", originName: "서울역", originLatitude: 37.55, originLongitude: 126.97, destinationName: "광화문", destinationLatitude: 37.57, destinationLongitude: 126.98, travelMode: "WALK", requiredBikeCount: 2 } }]))
    .mockResolvedValueOnce(response({ items: [], scoreSummary: null }));
  render(<ArchivePage onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByRole("tab", { name: "저장 경로" }));
  fireEvent.click(await screen.findByRole("button", { name: "입력 복원" }));
  expect(onNavigate).toHaveBeenCalledWith("main");
  expect(JSON.parse(sessionStorage.getItem("ddarung.savedRouteRestore.v1"))).toMatchObject({ originName: "서울역", destinationName: "광화문", requiredBikeCount: 2 });
});

test("uses prediction response items while preserving archive counts and other tabs", async () => {
  global.fetch.mockResolvedValueOnce(response([{ id: 1, stationId: 10, stationName: "성수역" }]))
    .mockResolvedValueOnce(response([{ id: 2, displayName: "서울역 → 광화문" }]))
    .mockResolvedValueOnce(response(predictionHistoryScoreFixture));
  render(<ArchivePage />);
  await screen.findByText("성수역");
  expect((await screen.findByText("내 보관함")).closest("main").querySelector(".archive-saved-count")).toHaveTextContent("6");
  fireEvent.click(screen.getByRole("tab", { name: "예측 이력" }));
  expect(await screen.findByText("2건 중 1건 적중 · 50%")).toBeInTheDocument();
  expect(screen.getAllByText("확인 불가")).toHaveLength(2);
  fireEvent.click(screen.getByRole("tab", { name: "저장 대여소" }));
  expect(await screen.findByText("성수역")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "저장 경로" }));
  expect(await screen.findByText(/서울역 → 광화문/)).toBeInTheDocument();
});

test("hides the score summary when there are no scored items", async () => {
  global.fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ items: predictionHistoryScoreFixture.items, scoreSummary: null }));
  render(<ArchivePage />);
  fireEvent.click(await screen.findByRole("tab", { name: "예측 이력" }));
  expect(screen.queryByText(/건 중 .*건 적중/)).not.toBeInTheDocument();
  expect(screen.queryByText("등급 안내가 실제와 맞았는지를 표시하며, 확률값의 정확도와는 다릅니다.")).not.toBeInTheDocument();
});

test("formats a UTC prediction target in Korea time", async () => {
  global.fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ items: [{ id: 1, stationName: "3559.성동구민종합체육센터 앞", requiredBikeCount: 1, predictionTargetAt: "2026-08-27T14:00:00Z", outcome: "HIT", actualBikeCount: 1 }], scoreSummary: null }));
  render(<ArchivePage />);
  fireEvent.click(await screen.findByRole("tab", { name: "예측 이력" }));
  expect(await screen.findByText("3559.성동구민종합체육센터 앞 · 1대 · 8월 27일 23:00")).toBeInTheDocument();
  expect(screen.queryByText(/2026-08-27T14:00:00Z/)).not.toBeInTheDocument();
});
