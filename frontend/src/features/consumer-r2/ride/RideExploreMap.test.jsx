import { act, render, screen, waitFor } from "@testing-library/react";
import RideExploreMap from "./RideExploreMap";

const station = { stationId: "ST-10", name: "성수역 대여소", latitude: 37.544, longitude: 127.056 };
const poi = { placeId: "poi-1", name: "서울숲", latitude: 37.545, longitude: 127.04 };

test("updates the same live map with provider POIs and a factual route", async () => {
  const setData = jest.fn();
  const destroy = jest.fn();
  const createMap = jest.fn().mockResolvedValue({ setData, destroy });
  const { rerender, unmount } = render(<RideExploreMap createMap={createMap} station={station} pois={[poi]} route={null} selectedPoi={null} />);
  await waitFor(() => expect(setData).toHaveBeenCalledWith({ station, pois: [poi], route: null, selectedPoi: null }));
  const route = { travelMode: "BICYCLE", pathPoints: [station, poi] };
  rerender(<RideExploreMap createMap={createMap} station={station} pois={[poi]} route={route} selectedPoi={poi} />);
  await waitFor(() => expect(setData).toHaveBeenLastCalledWith({ station, pois: [poi], route, selectedPoi: poi }));
  unmount();
  expect(destroy).toHaveBeenCalled();
});

test("keeps a map SDK failure separate from place and route provider state", async () => {
  const createMap = jest.fn().mockRejectedValue(new Error("KAKAO_MAP_SDK_FAILED"));
  render(<RideExploreMap createMap={createMap} station={station} pois={[poi]} route={null} selectedPoi={null} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("지도를 불러오지 못했습니다");
});

test("uses the latest factual map data when props change before the SDK is ready", async () => {
  let resolveMap;
  const mapRequest = new Promise((resolve) => { resolveMap = resolve; });
  const setData = jest.fn();
  const createMap = jest.fn().mockReturnValue(mapRequest);
  const nextStation = { ...station, stationId: "ST-20", name: "서울숲 남문 대여소" };
  const nextPoi = { ...poi, placeId: "poi-2", name: "뚝섬한강공원" };
  const nextRoute = { travelMode: "BICYCLE", pathPoints: [nextStation, nextPoi] };
  const { rerender } = render(<RideExploreMap createMap={createMap} station={station} pois={[poi]} route={null} selectedPoi={null} />);

  rerender(<RideExploreMap createMap={createMap} station={nextStation} pois={[nextPoi]} route={nextRoute} selectedPoi={nextPoi} />);
  await act(async () => resolveMap({ setData, destroy: jest.fn() }));

  await waitFor(() => expect(setData).toHaveBeenCalledWith({ station: nextStation, pois: [nextPoi], route: nextRoute, selectedPoi: nextPoi }));
  expect(setData).not.toHaveBeenCalledWith({ station, pois: [poi], route: null, selectedPoi: null });
});
