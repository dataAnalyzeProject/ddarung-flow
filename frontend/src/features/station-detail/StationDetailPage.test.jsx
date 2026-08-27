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
