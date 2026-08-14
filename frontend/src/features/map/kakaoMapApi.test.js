import { createKakaoMapAdapter } from "./kakaoMapApi";

const station = { stationId: "station-1", stationName: "성수역 3번 출구", latitude: 37.544, longitude: 127.056, availableBikeCount: 8 };

function createMapsMock() {
  const map = { setCenter: jest.fn(), panTo: jest.fn(), setLevel: jest.fn(), setMapTypeId: jest.fn() };
  return {
    Map: jest.fn(() => map),
    LatLng: jest.fn((latitude, longitude) => ({ latitude, longitude })),
    Size: jest.fn((width, height) => ({ width, height })),
    Point: jest.fn((x, y) => ({ x, y })),
    MarkerImage: jest.fn((src, size, options) => ({ src, size, options })),
    Marker: jest.fn((options) => ({ ...options, setMap: jest.fn() })),
    MarkerClusterer: jest.fn(() => ({ clear: jest.fn() })),
    CustomOverlay: jest.fn(() => ({ setMap: jest.fn() })),
    MapTypeId: { HYBRID: "hybrid", ROADMAP: "roadmap" },
    event: { addListener: jest.fn((marker, name, listener) => { marker[name] = listener; }) },
  };
}

test("대여소는 커스텀 이미지 marker와 clusterer로, 현재 위치는 별도 이미지 marker로 표시한다", () => {
  const maps = createMapsMock();
  const onStationSelected = jest.fn();
  const adapter = createKakaoMapAdapter(document.createElement("div"), maps, undefined, {
    currentMarkerImage: "current.png",
    stationMarkerImage: "station.png",
    onStationSelected,
  });

  adapter.setStations([station]);
  adapter.setPoints({ current: station, origin: null, destination: null });

  expect(maps.MarkerClusterer).toHaveBeenCalledWith(expect.objectContaining({ markers: expect.any(Array) }));
  expect(maps.MarkerImage).toHaveBeenCalledWith("station.png", expect.anything(), expect.anything());
  expect(maps.MarkerImage).toHaveBeenCalledWith("current.png", expect.anything(), expect.anything());
  maps.event.addListener.mock.calls[0][2]();
  expect(onStationSelected).toHaveBeenCalledWith(station);
  expect(maps.Map.mock.results[0].value.panTo).toHaveBeenCalledWith(expect.objectContaining({ latitude: station.latitude, longitude: station.longitude }));
  expect(maps.CustomOverlay).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(HTMLElement), yAnchor: 1.45 }));
});
