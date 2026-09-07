import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi.js";
import ConsumerRouteMap from "./ConsumerRouteMap.jsx";

jest.mock("../../map/kakaoMapApi.js", () => ({
  createKakaoMapAdapter: jest.fn(),
  loadKakaoMapSdk: jest.fn(),
}));

const origin = { latitude: 37.55, longitude: 127.04 };
const destination = { latitude: 37.57, longitude: 127.06 };
const candidate = {
  stationId: "PREDICTED",
  latitude: 37.58,
  longitude: 127.07,
  routeDetail: { distanceMeters: 800, durationSeconds: 600, pathPoints: [origin, destination] },
};
const locations = [
  { stationId: "ST-A", stationNumber: 101, name: "서울역", latitude: 37.551, longitude: 126.971 },
  { stationId: "ST-B", stationNumber: 102, name: "시청역", latitude: 37.566, longitude: 126.978 },
];

function createAdapter() {
  return {
    setCenter: jest.fn(),
    setPoints: jest.fn(),
    setRoutePath: jest.fn(),
    setStations: jest.fn(),
    showStationOverlay: jest.fn(),
  };
}

async function renderMap(overrides = {}) {
  const adapter = createAdapter();
  const props = {
    authState: "authenticated",
    candidate,
    destination,
    fetchStationDetail: jest.fn().mockResolvedValue({ ...locations[0], availableBikeCount: 4, collectedAt: "2026-09-07T03:00:00Z", inventoryStatus: "NORMAL" }),
    fetchStationLocations: jest.fn().mockResolvedValue(locations),
    onStationDetail: jest.fn(),
    origin,
    ...overrides,
  };
  createKakaoMapAdapter.mockReturnValue(adapter);
  const view = render(<ConsumerRouteMap {...props} />);
  await waitFor(() => expect(adapter.setRoutePath).toHaveBeenCalledWith(candidate.routeDetail.pathPoints));
  return { adapter, props, ...view };
}

async function showStationMarkers(adapter) {
  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  await waitFor(() => expect(adapter.setStations).toHaveBeenCalledWith(locations, expect.any(Function)));
  return adapter.setStations.mock.calls.find(([stations]) => stations === locations)[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  loadKakaoMapSdk.mockResolvedValue({});
  delete navigator.geolocation;
});

test("reports a map SDK failure as map-only unavailability", async () => {
  loadKakaoMapSdk.mockRejectedValue(new Error("KAKAO_MAP_SDK_FAILED"));
  render(<ConsumerRouteMap candidate={candidate} origin={origin} destination={destination} />);

  expect(await screen.findByText("지도만 불러오지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByText("예측 결과와 경로 요약은 그대로 확인할 수 있습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "내 위치" })).toBeDisabled();
});

test("keeps the selected prediction marker and route while anonymous users get location only", async () => {
  const fetchStationLocations = jest.fn();
  const { adapter } = await renderMap({ authState: "anonymous", fetchStationLocations });

  expect(adapter.setPoints).toHaveBeenCalledWith({ current: null, origin, destination: { latitude: 37.58, longitude: 127.07 } });
  expect(screen.getByRole("button", { name: "내 위치" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "대여소 표시" })).not.toBeInTheDocument();
  expect(fetchStationLocations).not.toHaveBeenCalled();
  expect(adapter.setStations).not.toHaveBeenCalledWith(locations, expect.anything());
});

test("loads station locations once per mount and hides markers without clearing the route", async () => {
  const { adapter, props } = await renderMap();
  const routeCalls = adapter.setRoutePath.mock.calls.length;
  await showStationMarkers(adapter);
  expect(props.fetchStationLocations).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "대여소 숨기기" }));
  await waitFor(() => expect(adapter.setStations).toHaveBeenLastCalledWith([], expect.any(Function)));
  expect(adapter.setRoutePath).toHaveBeenCalledTimes(routeCalls);

  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  await waitFor(() => expect(adapter.setStations).toHaveBeenLastCalledWith(locations, expect.any(Function)));
  expect(props.fetchStationLocations).toHaveBeenCalledTimes(1);
  expect(adapter.setRoutePath).toHaveBeenCalledTimes(routeCalls);
});

test("keeps a pending station location request alive while the prediction candidate changes", async () => {
  let resolveLocations;
  const fetchStationLocations = jest.fn(() => new Promise((resolve) => { resolveLocations = resolve; }));
  const { adapter, props, rerender } = await renderMap({ fetchStationLocations });
  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  await waitFor(() => expect(fetchStationLocations).toHaveBeenCalledTimes(1));

  const nextCandidate = {
    ...candidate,
    stationId: "PREDICTED-B",
    latitude: 37.59,
    longitude: 127.08,
    routeDetail: { ...candidate.routeDetail, pathPoints: [origin, { latitude: 37.59, longitude: 127.08 }] },
  };
  rerender(<ConsumerRouteMap {...props} candidate={nextCandidate} />);
  resolveLocations(locations);

  await waitFor(() => expect(adapter.setStations).toHaveBeenCalledWith(locations, expect.any(Function)));
  expect(screen.getByRole("button", { name: "대여소 숨기기" })).toBeEnabled();
  expect(createKakaoMapAdapter).toHaveBeenCalledTimes(1);
  expect(adapter.setRoutePath).toHaveBeenLastCalledWith(nextCandidate.routeDetail.pathPoints);
});

test("ignores an old station location response after logout and reauthentication", async () => {
  const pending = [];
  const fetchStationLocations = jest.fn(() => new Promise((resolve) => pending.push(resolve)));
  const { adapter, props, rerender } = await renderMap({ fetchStationLocations });
  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  await waitFor(() => expect(fetchStationLocations).toHaveBeenCalledTimes(1));

  rerender(<ConsumerRouteMap {...props} authState="anonymous" />);
  rerender(<ConsumerRouteMap {...props} authState="authenticated" />);
  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  await waitFor(() => expect(fetchStationLocations).toHaveBeenCalledTimes(2));

  const staleLocations = [{ ...locations[0], stationId: "STALE" }];
  pending[0](staleLocations);
  await Promise.resolve();
  expect(adapter.setStations).not.toHaveBeenCalledWith(staleLocations, expect.any(Function));

  pending[1](locations);
  await waitFor(() => expect(adapter.setStations).toHaveBeenCalledWith(locations, expect.any(Function)));
});

test("reports a station location failure locally without clearing the route", async () => {
  const { adapter } = await renderMap({ fetchStationLocations: jest.fn().mockRejectedValue(new Error("STATION_API_ERROR")) });
  const routeCalls = adapter.setRoutePath.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));

  expect(await screen.findByText("대여소 위치를 불러오지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "대여소 표시" })).toBeInTheDocument();
  expect(adapter.setRoutePath).toHaveBeenCalledTimes(routeCalls);
});

test("clears a previous station location error after a successful retry", async () => {
  const fetchStationLocations = jest.fn()
    .mockRejectedValueOnce(new Error("STATION_API_ERROR"))
    .mockResolvedValueOnce(locations);
  const { adapter } = await renderMap({ fetchStationLocations });
  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  expect(await screen.findByText("대여소 위치를 불러오지 못했습니다.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "대여소 표시" }));
  await waitFor(() => expect(adapter.setStations).toHaveBeenCalledWith(locations, expect.any(Function)));
  expect(screen.queryByText("대여소 위치를 불러오지 못했습니다.")).not.toBeInTheDocument();
});

test("shows loading and then the factual station snapshot without changing the prediction route", async () => {
  let resolveDetail;
  const fetchStationDetail = jest.fn(() => new Promise((resolve) => { resolveDetail = resolve; }));
  const { adapter } = await renderMap({ fetchStationDetail });
  const selectStation = await showStationMarkers(adapter);
  selectStation(locations[0]);
  expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: "ST-A", inventoryStatus: "LOADING", availableBikeCount: null }));

  resolveDetail({ ...locations[0], availableBikeCount: 0, collectedAt: "2026-09-07T03:00:00Z", inventoryStatus: "NORMAL" });
  await waitFor(() => expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: "ST-A", availableBikeCount: 0, inventoryStatus: "NORMAL" })));
  expect(fetchStationDetail).toHaveBeenCalledWith("ST-A");
});

test.each([
  ["NORMAL positive", { availableBikeCount: 4, inventoryStatus: "NORMAL", collectedAt: "2026-09-07T03:00:00Z" }, { availableBikeCount: 4, inventoryStatus: "NORMAL", collectedAt: "2026-09-07T03:00:00Z" }],
  ["NORMAL zero", { availableBikeCount: 0, inventoryStatus: "NORMAL", collectedAt: null }, { availableBikeCount: 0, inventoryStatus: "NORMAL", collectedAt: null }],
  ["DELAYED", { availableBikeCount: 4, inventoryStatus: "DELAYED", collectedAt: "2026-09-07T02:00:00Z" }, { availableBikeCount: 4, inventoryStatus: "DELAYED" }],
  ["MISSING", { availableBikeCount: 4, inventoryStatus: "MISSING", collectedAt: null }, { availableBikeCount: null, inventoryStatus: "MISSING", popupMessage: "재고 확인 필요" }],
  ["UNAVAILABLE", { availableBikeCount: 4, inventoryStatus: "UNAVAILABLE", collectedAt: null }, { availableBikeCount: null, inventoryStatus: "UNAVAILABLE", popupMessage: "재고 조회 불가" }],
  ["null count", { availableBikeCount: null, inventoryStatus: "NORMAL", collectedAt: null }, { availableBikeCount: null, inventoryStatus: "NORMAL", popupMessage: "확인 필요" }],
])("preserves %s inventory meaning in the overlay", async (_label, detail, expected) => {
  const { adapter } = await renderMap({ fetchStationDetail: jest.fn().mockResolvedValue({ ...locations[0], ...detail }) });
  const selectStation = await showStationMarkers(adapter);
  selectStation(locations[0]);
  await waitFor(() => expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining(expected)));
});

test.each([
  ["RHYTHM_NOT_AVAILABLE", "대여소 정보를 찾을 수 없습니다"],
  ["STATION_API_ERROR", "재고 조회 불가"],
])("shows a map-local %s detail failure and keeps the station identity", async (errorCode, popupMessage) => {
  const { adapter } = await renderMap({ fetchStationDetail: jest.fn().mockRejectedValue(new Error(errorCode)) });
  const selectStation = await showStationMarkers(adapter);
  selectStation(locations[0]);
  await waitFor(() => expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: "ST-A", availableBikeCount: null, inventoryStatus: "UNAVAILABLE", popupMessage })));
});

test("a late station A response cannot replace station B", async () => {
  const pending = {};
  const fetchStationDetail = jest.fn((stationId) => new Promise((resolve) => { pending[stationId] = resolve; }));
  const { adapter } = await renderMap({ fetchStationDetail });
  const selectStation = await showStationMarkers(adapter);
  selectStation(locations[0]);
  selectStation(locations[1]);
  pending["ST-B"]({ ...locations[1], availableBikeCount: 2, inventoryStatus: "NORMAL" });
  await waitFor(() => expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: "ST-B", availableBikeCount: 2 })));
  pending["ST-A"]({ ...locations[0], availableBikeCount: 9, inventoryStatus: "NORMAL" });
  await Promise.resolve();
  expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: "ST-B", availableBikeCount: 2 }));
});

test("hiding stations invalidates a pending detail response", async () => {
  let resolveDetail;
  const { adapter } = await renderMap({ fetchStationDetail: jest.fn(() => new Promise((resolve) => { resolveDetail = resolve; })) });
  const selectStation = await showStationMarkers(adapter);
  selectStation(locations[0]);
  fireEvent.click(screen.getByRole("button", { name: "대여소 숨기기" }));
  const callsAfterHide = adapter.showStationOverlay.mock.calls.length;
  resolveDetail({ ...locations[0], availableBikeCount: 8, inventoryStatus: "NORMAL" });
  await Promise.resolve();
  expect(adapter.showStationOverlay).toHaveBeenCalledTimes(callsAfterHide);
});

test("becoming anonymous clears station markers and invalidates pending detail", async () => {
  let resolveDetail;
  const fetchStationDetail = jest.fn(() => new Promise((resolve) => { resolveDetail = resolve; }));
  const { adapter, props, rerender } = await renderMap({ fetchStationDetail });
  const selectStation = await showStationMarkers(adapter);
  selectStation(locations[0]);
  rerender(<ConsumerRouteMap {...props} authState="anonymous" />);
  await waitFor(() => expect(adapter.setStations).toHaveBeenLastCalledWith([], expect.any(Function)));
  expect(screen.queryByRole("button", { name: /대여소/ })).not.toBeInTheDocument();
  const callsAfterLogout = adapter.showStationOverlay.mock.calls.length;
  resolveDetail({ ...locations[0], availableBikeCount: 8, inventoryStatus: "NORMAL" });
  await Promise.resolve();
  expect(adapter.showStationOverlay).toHaveBeenCalledTimes(callsAfterLogout);
});

test("uses browser geolocation for the current marker and center without redrawing the route", async () => {
  const geolocation = { getCurrentPosition: jest.fn((success) => success({ coords: { latitude: 37.501, longitude: 127.001 } })) };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
  const { adapter } = await renderMap({ authState: "anonymous" });
  const routeCalls = adapter.setRoutePath.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "내 위치" }));

  await waitFor(() => expect(adapter.setPoints).toHaveBeenLastCalledWith({ current: { latitude: 37.501, longitude: 127.001 }, origin, destination: { latitude: 37.58, longitude: 127.07 } }));
  expect(adapter.setCenter).toHaveBeenCalledWith({ latitude: 37.501, longitude: 127.001 });
  expect(adapter.setRoutePath).toHaveBeenCalledTimes(routeCalls);
  expect(screen.getByText("현재 위치를 지도에 표시했습니다.")).toBeInTheDocument();
});

test.each([
  [1, "현재 위치 권한이 거부되었습니다."],
  [3, "현재 위치 확인 시간이 초과되었습니다."],
  [2, "현재 위치를 확인할 수 없습니다."],
])("reports geolocation error %s without substituting coordinates", async (code, message) => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: jest.fn((_success, failure) => failure({ code })) } });
  const { adapter } = await renderMap({ authState: "anonymous" });
  const pointsBefore = adapter.setPoints.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "내 위치" }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(adapter.setPoints).toHaveBeenCalledTimes(pointsBefore);
});

test("reports unsupported geolocation without calling a location provider", async () => {
  const { adapter } = await renderMap({ authState: "anonymous" });
  const pointsBefore = adapter.setPoints.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "내 위치" }));
  expect(screen.getByText("이 브라우저는 현재 위치를 지원하지 않습니다.")).toBeInTheDocument();
  expect(adapter.setPoints).toHaveBeenCalledTimes(pointsBefore);
});

test("passes the exact browsed station id to detail navigation", async () => {
  const onStationDetail = jest.fn();
  await renderMap({ onStationDetail });
  createKakaoMapAdapter.mock.calls[0][3].onStationDetail("ST-B");
  expect(onStationDetail).toHaveBeenCalledWith("ST-B");
});
