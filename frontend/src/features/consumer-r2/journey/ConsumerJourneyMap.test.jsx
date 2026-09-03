import { render, screen, waitFor } from "@testing-library/react";
import { loadKakaoMapSdk } from "../../map/kakaoMapApi.js";
import ConsumerJourneyMap from "./ConsumerJourneyMap";

jest.mock("../../map/kakaoMapApi.js", () => ({ loadKakaoMapSdk: jest.fn() }));

const point = (latitude, longitude) => ({ latitude, longitude });
const segments = [
  { type: "ACCESS", pathPoints: [point(37.5, 127), point(37.51, 127.01)] },
  { type: "RIDE", pathPoints: [] },
  { type: "RIDE", pathPoints: [point(37.55, 127.05), point(37.56, 127.06)] },
];

function sdk() {
  return {
    LatLng: jest.fn().mockImplementation((latitude, longitude) => ({ latitude, longitude })),
    Map: jest.fn().mockImplementation(() => ({ setBounds: jest.fn(), relayout: jest.fn() })),
    LatLngBounds: jest.fn().mockImplementation(() => ({ extend: jest.fn() })),
    Polyline: jest.fn().mockImplementation(() => ({ setMap: jest.fn() })),
    Marker: jest.fn().mockImplementation(() => ({ setMap: jest.fn() })),
  };
}

const originalResizeObserver = global.ResizeObserver;
beforeEach(() => {
  jest.clearAllMocks();
  global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
});
afterEach(() => { global.ResizeObserver = originalResizeObserver; });

test("keeps both route endpoints in bounds after container resize and disconnects on exit", async () => {
  const maps = sdk();
  loadKakaoMapSdk.mockResolvedValue(maps);
  const { unmount } = render(<ConsumerJourneyMap segments={segments} />);
  await waitFor(() => expect(global.ResizeObserver).toHaveBeenCalledTimes(1));
  const map = maps.Map.mock.results[0].value;
  const bounds = map.setBounds.mock.calls[0][0];
  const observer = global.ResizeObserver.mock.results[0].value;
  global.ResizeObserver.mock.calls[0][0]();
  expect(map.relayout).toHaveBeenCalledTimes(1);
  expect(map.setBounds).toHaveBeenLastCalledWith(bounds);
  expect(map.setBounds).toHaveBeenCalledTimes(2);
  expect(maps.Polyline).toHaveBeenCalledTimes(2);
  unmount();
  expect(observer.disconnect).toHaveBeenCalledTimes(1);
});

test("draws each real segment separately and leaves missing route gaps unconnected", async () => {
  const maps = sdk();
  loadKakaoMapSdk.mockResolvedValue(maps);
  const { unmount } = render(<ConsumerJourneyMap segments={segments} />);
  await waitFor(() => expect(maps.Polyline).toHaveBeenCalledTimes(2));
  expect(maps.Map).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ center: segments[0].pathPoints[0] }));
  expect(maps.Polyline.mock.calls.map(([options]) => options.path)).toEqual([segments[0].pathPoints, segments[2].pathPoints]);
  expect(maps.Marker.mock.calls.map(([options]) => options.position)).toEqual([...segments[0].pathPoints, ...segments[2].pathPoints]);
  expect(screen.getByText(/확인하지 못한 구간은 연결하지 않았습니다/)).toBeInTheDocument();
  unmount();
  maps.Polyline.mock.results.forEach(({ value }) => expect(value.setMap).toHaveBeenCalledWith(null));
  maps.Marker.mock.results.forEach(({ value }) => expect(value.setMap).toHaveBeenCalledWith(null));
});

test("does not stitch around a missing point inside a provider segment", async () => {
  const maps = sdk();
  loadKakaoMapSdk.mockResolvedValue(maps);
  render(<ConsumerJourneyMap segments={[segments[0], { type: "RIDE", pathPoints: [point(37.55, 127.05), point(null, 127.055), point(37.56, 127.06)] }]} />);
  await waitFor(() => expect(maps.Polyline).toHaveBeenCalledTimes(1));
  expect(maps.Polyline.mock.calls[0][0].path).toEqual(segments[0].pathPoints);
});

test("shows missing coordinates without requesting or inventing a map route", () => {
  render(<ConsumerJourneyMap segments={[{ type: "RIDE", pathPoints: [] }]} />);
  expect(screen.getByRole("heading", { name: "확인된 경로 좌표가 없습니다" })).toBeInTheDocument();
  expect(loadKakaoMapSdk).not.toHaveBeenCalled();
});

test("reports SDK unavailability separately without replacing the factual itinerary", async () => {
  loadKakaoMapSdk.mockRejectedValue(new Error("KAKAO_MAP_SDK_FAILED"));
  render(<ConsumerJourneyMap segments={segments} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("지도만 불러오지 못했습니다");
  expect(screen.getByText("일정과 확인된 근거는 계속 확인할 수 있습니다.")).toBeInTheDocument();
});
