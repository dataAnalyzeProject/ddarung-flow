import { render, screen } from "@testing-library/react";
import StationDetailPage from "./StationDetailPage";
import { fetchStationDetail, fetchStationRhythm } from "./stationRhythmApi";

jest.mock("./stationRhythmApi", () => ({ fetchStationDetail: jest.fn(), fetchStationRhythm: jest.fn() }));

beforeEach(() => {
  fetchStationDetail.mockResolvedValue({ stationName: "테스트", availableBikeCount: 0, inventoryStatus: "NORMAL" });
  fetchStationRhythm.mockResolvedValue({ sampleCount: 20, weekdayHourly: Array.from({ length: 20 }, (_, index) => ({ dayOfWeek: index % 7 + 1, hourOfDay: 8, sampleCount: 10, stockoutRate: 0 })), stockout: {} });
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
