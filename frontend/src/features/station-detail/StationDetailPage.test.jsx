import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StationDetailPage from "./StationDetailPage";
import { fetchNearbyStations, fetchStationDetail, fetchStationRhythm } from "./stationRhythmApi";
import { loadArchive, removeFavorite, saveFavorite } from "../archive/archiveApi";

jest.mock("./stationRhythmApi", () => ({ fetchNearbyStations: jest.fn(), fetchStationDetail: jest.fn(), fetchStationRhythm: jest.fn() }));
jest.mock("../archive/archiveApi", () => ({ loadArchive: jest.fn(), removeFavorite: jest.fn(), saveFavorite: jest.fn() }));

beforeEach(() => {
  fetchStationDetail.mockResolvedValue({ stationId: "ST-10", stationNumber: "108", stationName: "테스트", latitude: 37.5, longitude: 127, collectedAt: "2026-08-27T03:34:49.386901Z", availableBikeCount: 0, inventoryStatus: "NORMAL" });
  fetchStationRhythm.mockResolvedValue({ sampleCount: 20, weekdayHourly: Array.from({ length: 20 }, (_, index) => ({ dayOfWeek: index % 7 + 1, hourOfDay: 8, sampleCount: 10, stockoutRate: 0 })), stockout: {} });
  fetchNearbyStations.mockResolvedValue([{ stationId: "ST-11", stationName: "가까운 대여소" }]);
  loadArchive.mockResolvedValue([[], [], []]);
});

test("formats collection time, renders nearby stations, and saves then removes a favorite with its public station number", async () => {
  saveFavorite.mockResolvedValue({ id: 1, stationId: 108 });
  removeFavorite.mockResolvedValue();
  render(<StationDetailPage stationId="ST-10" authState="authenticated" />);
  expect(await screen.findByText(/8월 27일/)).toBeInTheDocument();
  expect(screen.queryByText("2026-08-27T03:34:49.386901Z")).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "가까운 대여소" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "즐겨찾기" }));
  await waitFor(() => expect(saveFavorite).toHaveBeenCalledWith({ stationId: 108, stationName: "테스트" }));
  expect(await screen.findByRole("button", { name: "즐겨찾기 해제" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 해제" }));
  await waitFor(() => expect(removeFavorite).toHaveBeenCalledWith(1));
  expect(await screen.findByRole("button", { name: "즐겨찾기" })).toBeInTheDocument();
});

test("loads a stored favorite by station number and removes that same favorite", async () => {
  loadArchive.mockResolvedValue([[{ id: 2, stationId: 108, stationName: "테스트" }], [], []]);
  removeFavorite.mockResolvedValue();
  render(<StationDetailPage stationId="ST-10" authState="authenticated" />);
  fireEvent.click(await screen.findByRole("button", { name: "즐겨찾기 해제" }));
  await waitFor(() => expect(removeFavorite).toHaveBeenCalledWith(2));
  expect(await screen.findByRole("button", { name: "즐겨찾기" })).toBeInTheDocument();
});

test("MISSING is not rendered as zero bikes", async () => {
  render(<StationDetailPage stationId="ST-10" authState="authenticated" />);
  expect(await screen.findByRole("heading", { name: /테스트/ })).toBeInTheDocument();
});

test("does not render a heatmap when fewer than 20 cells remain", async () => {
  fetchStationRhythm.mockResolvedValueOnce({ sampleCount: 19, weekdayHourly: Array.from({ length: 19 }, (_, index) => ({ dayOfWeek: 1, hourOfDay: index, sampleCount: 10, stockoutRate: 0 })), stockout: {} });
  render(<StationDetailPage stationId="ST-10" authState="authenticated" />);
  await screen.findByRole("heading", { name: /테스트/ });
  expect(screen.queryByLabelText("요일 시간대별 재고 패턴")).not.toBeInTheDocument();
});
