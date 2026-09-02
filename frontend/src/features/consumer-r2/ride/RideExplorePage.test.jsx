import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RideExplorePage from "./RideExplorePage";

const station = { stationId: "ST-10", name: "성수역 3번 출구 대여소", latitude: 37.544, longitude: 127.056, availableBikeCount: 7, collectedAt: "2026-09-02T12:30:00+09:00", inventoryStatus: "NORMAL" };
const pois = [
  { placeId: "poi-1", name: "서울숲", address: "서울 성동구 뚝섬로 273", category: "공원", latitude: 37.545, longitude: 127.04, distanceMeters: 2800 },
  { placeId: "poi-2", name: "뚝섬한강공원", address: "서울 광진구", category: "공원", latitude: 37.53, longitude: 127.07, distanceMeters: 3400 },
];
const route = { distanceMeters: 2800, durationSeconds: 780, travelMode: "BICYCLE", pathPoints: [{ latitude: 37.544, longitude: 127.056 }, { latitude: 37.545, longitude: 127.04 }] };
const TestMap = ({ route: currentRoute }) => <div data-testid="ride-map">{currentRoute ? "route-visible" : "pois-visible"}</div>;

function createAdapter(overrides = {}) {
  return {
    loadStation: jest.fn().mockResolvedValue(station),
    loadPois: jest.fn().mockResolvedValue(pois),
    loadRoute: jest.fn().mockResolvedValue(route),
    ...overrides,
  };
}

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test("shows the factual source station and provider POIs without AI claims", async () => {
  const adapter = createAdapter();
  render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  expect(await screen.findByText("성수역 3번 출구 대여소")).toBeInTheDocument();
  expect(screen.getByText(/현재 자전거 7대 · 정상 · .* 기준/)).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "서울숲" })).toBeInTheDocument();
  expect(screen.getByText("2.8km")).toBeInTheDocument();
  expect(screen.getByText(/AI 추천이나 임의 점수를 사용하지 않습니다/)).toBeInTheDocument();
  expect(adapter.loadPois).toHaveBeenCalledWith(expect.objectContaining({ stationId: "ST-10", theme: "PARK" }));
});

test.each([
  ["NORMAL", "현재 자전거 7대", "정상"],
  ["DELAYED", "지연 재고 7대", null],
  ["MISSING", "재고 수집 누락", null],
  ["UNAVAILABLE", "재고 조회 불가", null],
  [null, "재고 상태 미제공", null],
])("preserves the %s station inventory state and collection time", async (inventoryStatus, expected, secondary) => {
  const adapter = createAdapter({ loadStation: jest.fn().mockResolvedValue({ ...station, inventoryStatus }) });
  const { unmount } = render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  const inventory = await screen.findByText((content) => content.includes(expected));
  expect(inventory).toHaveTextContent("기준");
  if (secondary) expect(inventory).toHaveTextContent(secondary);
  if (inventoryStatus === "DELAYED") expect(screen.queryByText(/^현재 자전거 7대/)).not.toBeInTheDocument();
  unmount();
});

test("requests a real bicycle route for the selected provider POI and all route modes", async () => {
  const adapter = createAdapter();
  render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "서울숲 선택" }));
  await waitFor(() => expect(adapter.loadRoute).toHaveBeenCalledWith(expect.objectContaining({ station, poi: pois[0], routeMode: "BIKE_ONLY" })));
  expect(await screen.findByText("약 13분")).toBeInTheDocument();
  expect(screen.getByText("자전거")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "접근성 우선" }));
  await waitFor(() => expect(adapter.loadRoute).toHaveBeenLastCalledWith(expect.objectContaining({ routeMode: "ACCESSIBLE" })));
  fireEvent.click(screen.getByRole("button", { name: "최단 거리" }));
  await waitFor(() => expect(adapter.loadRoute).toHaveBeenLastCalledWith(expect.objectContaining({ routeMode: "SHORTEST" })));
});

test("keeps POI empty and POI provider error distinct", async () => {
  const emptyAdapter = createAdapter({ loadPois: jest.fn().mockResolvedValue([]) });
  const { unmount } = render(<RideExplorePage adapter={emptyAdapter} stationId="ST-10" MapComponent={TestMap} />);
  expect(await screen.findByRole("heading", { name: "주변 장소가 없습니다" })).toBeInTheDocument();
  unmount();

  const errorAdapter = createAdapter({ loadPois: jest.fn().mockRejectedValue(new Error("PLACE_PROVIDER_ERROR")) });
  render(<RideExplorePage adapter={errorAdapter} stationId="ST-10" MapComponent={TestMap} />);
  expect(await screen.findByRole("heading", { name: "주변 장소를 불러오지 못했습니다" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});

test("keeps route loading and route provider error distinct from POI success", async () => {
  let rejectRoute;
  const routeRequest = new Promise((resolve, reject) => { rejectRoute = reject; });
  const adapter = createAdapter({ loadRoute: jest.fn().mockReturnValue(routeRequest) });
  render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "서울숲 선택" }));
  expect(await screen.findByRole("heading", { name: "자전거 경로를 찾는 중…" })).toBeInTheDocument();
  rejectRoute(new Error("ROUTE_PROVIDER_ERROR"));
  expect(await screen.findByRole("heading", { name: "자전거 경로를 불러오지 못했습니다" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "서울숲" })).toBeInTheDocument();
});

test("clears old theme facts immediately and ignores a late provider response", async () => {
  const parkRequest = deferred();
  const riverRequest = deferred();
  const adapter = createAdapter({
    loadPois: jest.fn(({ theme }) => theme === "PARK" ? parkRequest.promise : riverRequest.promise),
  });
  render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "한강" }));
  expect(await screen.findByRole("heading", { name: "주변 장소를 찾는 중…" })).toBeInTheDocument();

  await act(async () => parkRequest.resolve(pois));
  expect(screen.queryByRole("heading", { name: "서울숲" })).not.toBeInTheDocument();

  const riverPoi = { ...pois[1], category: "한강", placeId: "river-1" };
  await act(async () => riverRequest.resolve([riverPoi]));
  expect(await screen.findByRole("heading", { name: riverPoi.name })).toBeInTheDocument();
  expect(screen.getAllByText("한강")).toHaveLength(2);
});

test("clears old station facts immediately and ignores a late station response", async () => {
  const oldStationRequest = deferred();
  const newStationRequest = deferred();
  const adapter = createAdapter({
    loadStation: jest.fn((stationId) => stationId === "ST-10" ? oldStationRequest.promise : newStationRequest.promise),
  });
  const { rerender } = render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  rerender(<RideExplorePage adapter={adapter} stationId="ST-11" MapComponent={TestMap} />);
  expect(await screen.findByRole("heading", { name: "대여소 정보를 확인하는 중…" })).toBeInTheDocument();

  await act(async () => oldStationRequest.resolve(station));
  expect(screen.queryByText("성수역 3번 출구 대여소")).not.toBeInTheDocument();

  const newStation = { ...station, stationId: "ST-11", name: "서울숲 남문 대여소" };
  await act(async () => newStationRequest.resolve(newStation));
  expect(await screen.findByText("서울숲 남문 대여소")).toBeInTheDocument();
});

test("does not combine a new station with old POI or route context", async () => {
  const newStationRequest = deferred();
  const lateOldPoiRequest = deferred();
  const newPoiRequest = deferred();
  const newStation = { ...station, stationId: "ST-20", name: "서울숲 남문 대여소" };
  const newPoi = { ...pois[1], placeId: "st20-river-1", name: "서울숲 한강 전망대", category: "한강" };
  const loadRoute = jest.fn().mockResolvedValue(route);
  const adapter = createAdapter({
    loadStation: jest.fn((stationId) => stationId === "ST-10" ? Promise.resolve(station) : newStationRequest.promise),
    loadPois: jest.fn(({ stationId, theme }) => {
      if (stationId === "ST-10" && theme === "PARK") return Promise.resolve(pois);
      if (stationId === "ST-10") return lateOldPoiRequest.promise;
      return newPoiRequest.promise;
    }),
    loadRoute,
  });
  const { rerender } = render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "서울숲 선택" }));
  expect(await screen.findByText("약 13분")).toBeInTheDocument();
  expect(loadRoute).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "한강" }));
  rerender(<RideExplorePage adapter={adapter} stationId="ST-20" MapComponent={TestMap} />);
  expect(screen.queryByRole("heading", { name: "서울숲" })).not.toBeInTheDocument();
  expect(screen.queryByText("약 13분")).not.toBeInTheDocument();

  await act(async () => newStationRequest.resolve(newStation));
  await waitFor(() => expect(adapter.loadPois).toHaveBeenCalledWith(expect.objectContaining({ stationId: "ST-20", theme: "RIVER" })));
  expect(loadRoute).toHaveBeenCalledTimes(1);

  await act(async () => lateOldPoiRequest.resolve([{ ...pois[0], placeId: "late-old" }]));
  expect(screen.queryByRole("heading", { name: "서울숲" })).not.toBeInTheDocument();
  expect(loadRoute).toHaveBeenCalledTimes(1);

  await act(async () => newPoiRequest.resolve([newPoi]));
  fireEvent.click(await screen.findByRole("button", { name: `${newPoi.name} 선택` }));
  await waitFor(() => expect(loadRoute).toHaveBeenCalledTimes(2));
  expect(loadRoute).toHaveBeenLastCalledWith(expect.objectContaining({ station: newStation, poi: newPoi }));
});

test("clears an old route immediately and ignores a late route-mode response", async () => {
  const bikeRequest = deferred();
  const accessibleRequest = deferred();
  const adapter = createAdapter({
    loadRoute: jest.fn(({ routeMode }) => routeMode === "BIKE_ONLY" ? bikeRequest.promise : accessibleRequest.promise),
  });
  render(<RideExplorePage adapter={adapter} stationId="ST-10" MapComponent={TestMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "서울숲 선택" }));
  fireEvent.click(await screen.findByRole("button", { name: "접근성 우선" }));
  expect(await screen.findByRole("heading", { name: "자전거 경로를 찾는 중…" })).toBeInTheDocument();

  await act(async () => bikeRequest.resolve(route));
  expect(screen.queryByText("약 13분")).not.toBeInTheDocument();

  await act(async () => accessibleRequest.resolve({ ...route, durationSeconds: 1200 }));
  expect(await screen.findByText("약 20분")).toBeInTheDocument();
  expect(screen.getAllByText("접근성 우선")).toHaveLength(2);
});

test("does not request a route before the source station is available", async () => {
  const adapter = createAdapter({ loadStation: jest.fn().mockRejectedValue(new Error("STATION_NOT_FOUND")) });
  render(<RideExplorePage adapter={adapter} stationId="missing" MapComponent={TestMap} />);
  expect(await screen.findByRole("heading", { name: "대여소 정보를 불러오지 못했습니다" })).toBeInTheDocument();
  expect(adapter.loadRoute).not.toHaveBeenCalled();
});
