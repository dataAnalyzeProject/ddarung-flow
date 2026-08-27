import { createKakaoMapAdapter } from "./kakaoMapApi";

const station = { stationId: "station-1", name: "성수역 3번 출구", latitude: 37.544, longitude: 127.056, availableBikeCount: 8 };

function createMapsMock() {
  const map = { setCenter: jest.fn(), setBounds: jest.fn(), panTo: jest.fn(), setLevel: jest.fn(), setMapTypeId: jest.fn() };
  return {
    Map: jest.fn(() => map),
    LatLng: jest.fn((latitude, longitude) => ({ latitude, longitude })),
    Size: jest.fn((width, height) => ({ width, height })),
    Point: jest.fn((x, y) => ({ x, y })),
    MarkerImage: jest.fn((src, size, options) => ({ src, size, options })),
    Marker: jest.fn((options) => ({ ...options, setMap: jest.fn() })),
    Polyline: jest.fn((options) => ({ ...options, setMap: jest.fn() })),
    LatLngBounds: jest.fn(() => ({ extend: jest.fn() })),
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
  expect(maps.CustomOverlay).not.toHaveBeenCalled();
  adapter.showStationOverlay(station);
  expect(maps.CustomOverlay).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(HTMLElement), yAnchor: 1.45 }));
});

test("경로 좌표를 파란 폴리라인으로 그리고 빈 좌표에서는 기존 선을 지운다", () => {
  const maps = createMapsMock();
  const adapter = createKakaoMapAdapter(document.createElement("div"), maps);

  adapter.setRoutePath([{ latitude: 37.54, longitude: 127.05 }, { latitude: 37.55, longitude: 127.06 }]);
  expect(maps.Polyline).toHaveBeenCalledWith(expect.objectContaining({
    strokeColor: "#1476ff",
    zIndex: 10,
    path: [expect.objectContaining({ latitude: 37.54 }), expect.objectContaining({ latitude: 37.55 })],
  }));
  expect(maps.Map.mock.results[0].value.setBounds).toHaveBeenCalled();
  const line = maps.Polyline.mock.results[0].value;
  adapter.setRoutePath([]);
  expect(line.setMap).toHaveBeenCalledWith(null);
});

test("경로를 맞춘 뒤 마커를 갱신해도 지도 중심을 목적지로 덮어쓰지 않는다", () => {
  const maps = createMapsMock();
  const adapter = createKakaoMapAdapter(document.createElement("div"), maps);
  const map = maps.Map.mock.results[0].value;

  adapter.setRoutePath([{ latitude: 37.54, longitude: 127.05 }, { latitude: 37.55, longitude: 127.06 }]);
  adapter.setPoints({ current: null, origin: { latitude: 37.54, longitude: 127.05 }, destination: { latitude: 37.55, longitude: 127.06 } });

  expect(map.setBounds).toHaveBeenCalledTimes(1);
  expect(map.setCenter).not.toHaveBeenCalled();
});
