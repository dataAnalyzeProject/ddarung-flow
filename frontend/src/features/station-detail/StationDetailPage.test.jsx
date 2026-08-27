import { render, screen } from "@testing-library/react";
import StationDetailPage from "./StationDetailPage";
import { fetchNearbyStations, fetchStationDetail, fetchStationRhythm } from "./stationRhythmApi";
import { loadArchive, saveFavorite } from "../archive/archiveApi";

jest.mock("./stationRhythmApi", () => ({ fetchNearbyStations: jest.fn(), fetchStationDetail: jest.fn(), fetchStationRhythm: jest.fn() }));
jest.mock("../archive/archiveApi", () => ({ loadArchive: jest.fn(), removeFavorite: jest.fn(), saveFavorite: jest.fn() }));

beforeEach(() => {
  fetchStationDetail.mockResolvedValue({ stationId: "ST-10", stationName: "테스트", latitude: 37.5, longitude: 127, collectedAt: "2026-08-27T03:34:49.386901Z", availableBikeCount: 0, inventoryStatus: "NORMAL" });
  fetchStationRhythm.mockResolvedValue({ sampleCount: 20, weekdayHourly: Array.from({ length: 20 }, (_, index) => ({ dayOfWeek: index % 7 + 1, hourOfDay: 8, sampleCount: 10, stockoutRate: 0 })), stockout: {} });
  fetchNearbyStations.mockResolvedValue([{ stationId: "ST-11", stationName: "가까운 대여소" }]);
  loadArchive.mockResolvedValue([[], [], []]);
});

test("formats collection time, renders nearby stations, and saves a favorite", async () => {
  saveFavorite.mockResolvedValue({ id: 1, stationId: "ST-10" });
  render(<StationDetailPage stationId="ST-10" authState="authenticated" />);
  expect(await screen.findByText(/8월 27일/)).toBeInTheDocument();
  expect(screen.queryByText("2026-08-27T03:34:49.386901Z")).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "가까운 대여소" })).toBeInTheDocument();
  screen.getByRole("button", { name: "즐겨찾기" }).click();
  expect(saveFavorite).toHaveBeenCalledWith({ stationId: "ST-10", stationName: "테스트" });
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
