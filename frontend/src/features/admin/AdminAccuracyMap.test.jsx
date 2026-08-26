import { render, screen, waitFor } from "@testing-library/react";
import AdminAccuracyMap, { accuracyTone } from "./AdminAccuracyMap";
import { loadKakaoMapSdk } from "../map/kakaoMapApi";
import { fetchStationLocations } from "../map/stationApi";

jest.mock("../map/kakaoMapApi", () => ({ loadKakaoMapSdk: jest.fn() }));
jest.mock("../map/stationApi", () => ({ fetchStationLocations: jest.fn() }));

const maps = { LatLng: jest.fn(), Map: jest.fn(), Marker: jest.fn(), MarkerImage: jest.fn(), Size: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  loadKakaoMapSdk.mockResolvedValue(maps);
  fetchStationLocations.mockResolvedValue([{ stationId: "ST-1", name: "대여소 1", latitude: 37.5, longitude: 127.0 }]);
});

test("기존 대여소 위치 API와 Kakao 지도로 skill score 마커를 렌더링한다", async () => {
  render(<AdminAccuracyMap segments={[{ axis: "STATION", segmentValue: "ST-1", skillScore: .2, status: "OK" }]} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalled());
  expect(fetchStationLocations).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("skill score 범례")).toHaveTextContent("양수0음수표본 부족");
});

test("표본 부족 대여소는 중립색이며 score 수치를 만들지 않는다", async () => {
  render(<AdminAccuracyMap segments={[{ axis: "STATION", segmentValue: "ST-1", skillScore: null, status: "UNKNOWN_INSUFFICIENT_SAMPLES" }]} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalledWith(expect.objectContaining({ title: "대여소 1 · 표본 부족" })));
  expect(accuracyTone({ status: "UNKNOWN_INSUFFICIENT_SAMPLES", skillScore: null })).toBe("unknown");
  expect(accuracyTone({ status: "OK", skillScore: 0 })).toBe("warn");
});
