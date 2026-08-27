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
  fetchStationLocations.mockResolvedValue([{ stationId: "ST-1", stationNumber: "108", name: "대여소 1", latitude: 37.5, longitude: 127.0 }]);
});

test("기존 대여소 위치 API와 Kakao 지도로 skill score 마커를 렌더링한다", async () => {
  render(<AdminAccuracyMap segments={[{ axis: "STATION", segmentValue: "108", skillScore: .2, status: "OK" }]} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalled());
  expect(fetchStationLocations).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("skill score 범례")).toHaveTextContent("양수0음수표본 부족");
});

test("표본 부족 대여소는 중립색이며 score 수치를 만들지 않는다", async () => {
  render(<AdminAccuracyMap segments={[{ axis: "STATION", segmentValue: "108", skillScore: null, status: "UNKNOWN_INSUFFICIENT_SAMPLES" }]} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalledWith(expect.objectContaining({ title: "대여소 1 · 표본 부족" })));
  expect(accuracyTone({ status: "UNKNOWN_INSUFFICIENT_SAMPLES", skillScore: null })).toBe("unknown");
  expect(accuracyTone({ status: "OK", skillScore: 0 })).toBe("warn");
});

test("skill score가 없는 대여소는 마커 제목에 대시로 표시한다", async () => {
  render(<AdminAccuracyMap segments={[{ axis: "STATION", segmentValue: "108", skillScore: null, status: "OK" }]} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalledWith(expect.objectContaining({ title: "대여소 1 · skill score -" })));
  expect(accuracyTone({ status: "OK", skillScore: null })).toBe("unknown");
});

test("station number가 없는 대여소는 unknown 톤으로 처리한다", async () => {
  fetchStationLocations.mockResolvedValue([{ stationId: "ST-1", stationNumber: null, name: "대여소 1", latitude: 37.5, longitude: 127.0 }]);

  render(<AdminAccuracyMap segments={[{ axis: "STATION", segmentValue: "108", skillScore: .2, status: "OK" }]} />);

  await waitFor(() => expect(maps.MarkerImage).toHaveBeenCalled());
  expect(maps.MarkerImage.mock.calls.some(([url]) => url.includes("%237b8797"))).toBe(true);
  expect(accuracyTone()).toBe("unknown");
});

test("station number로 2,700개 이상의 대여소를 조인한다", async () => {
  const locations = Array.from({ length: 2700 }, (_, index) => ({ stationId: `ST-${index}`, stationNumber: `${index}`, name: `대여소 ${index}`, latitude: 37.5, longitude: 127.0 }));
  const segments = locations.map((location) => ({ axis: "STATION", segmentValue: location.stationNumber, skillScore: .2, status: "OK" }));
  fetchStationLocations.mockResolvedValue(locations);

  render(<AdminAccuracyMap segments={segments} />);

  await waitFor(() => expect(maps.Marker).toHaveBeenCalledTimes(2700));
});
