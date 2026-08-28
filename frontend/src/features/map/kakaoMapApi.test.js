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
    event: {
      addListener: jest.fn((marker, name, listener) => { marker[name] = listener; }),
      removeListener: jest.fn((marker, name) => { delete marker[name]; }),
    },
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

test("상세 콜백이 있을 때만 XSS 안전한 상세 보기 버튼을 추가한다", () => {
  const maps = createMapsMock();
  const onStationDetail = jest.fn();
  const adapter = createKakaoMapAdapter(document.createElement("div"), maps, undefined, { onStationDetail });
  adapter.showStationOverlay({ ...station, name: "<img src=x>" });
  const content = maps.CustomOverlay.mock.calls[0][0].content;
  expect(content.querySelector("strong").textContent).toBe("<img src=x>");
  expect(content.querySelector("img")).toBeNull();
  content.querySelector("button").click();
  expect(onStationDetail).toHaveBeenCalledWith("station-1");
  const noCallbackMaps = createMapsMock();
  const noCallback = createKakaoMapAdapter(document.createElement("div"), noCallbackMaps);
  noCallback.showStationOverlay(station);
  expect(noCallbackMaps.CustomOverlay.mock.calls[0][0].content.querySelector("button")).toBeNull();
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

test("확대·축소 전환 중에는 마지막 레벨만 idle 뒤에 적용한다", () => {
  const maps = createMapsMock();
  const adapter = createKakaoMapAdapter(document.createElement("div"), maps);
  const map = maps.Map.mock.results[0].value;

  adapter.setLevel(4);
  adapter.setLevel(3);

  expect(map.setLevel).toHaveBeenCalledTimes(1);
  expect(map.setLevel).toHaveBeenCalledWith(4, { animate: { duration: 180 } });
  map.idle();
  expect(map.setLevel).toHaveBeenCalledTimes(2);
  expect(map.setLevel).toHaveBeenLastCalledWith(3, { animate: { duration: 180 } });
});
