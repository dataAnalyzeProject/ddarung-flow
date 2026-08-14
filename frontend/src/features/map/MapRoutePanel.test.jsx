import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MapRoutePanel, { formatArrival, locationErrorMessage } from "./MapRoutePanel";
import { createKakaoMapAdapter, estimateRoute, loadKakaoMapSdk } from "./kakaoMapApi";
import { fetchStationDetail, fetchStationLocations } from "./stationApi";

jest.mock("./kakaoMapApi", () => ({
  estimateRoute: jest.fn(),
  loadKakaoMapSdk: jest.fn(),
  createKakaoMapAdapter: jest.fn(),
}));

jest.mock("./stationApi", () => ({
  fetchStationLocations: jest.fn(),
  fetchStationDetail: jest.fn(),
}));

const selectedPlaces = {
  origin: { placeId: "o", name: "서울역", address: "서울 중구", latitude: 37.55, longitude: 126.97 },
  destination: { placeId: "d", name: "서울시청", address: "서울 중구", latitude: 37.56, longitude: 126.98 },
};

function renderPanel(props = {}) {
  return render(<MapRoutePanel travelMode="도보" selectedPlaces={{ origin: null, destination: null }} fallbackImage="fallback.png" {...props} />);
}

describe("INT-3.6 MapRoutePanel", () => {
  const originalGeolocation = navigator.geolocation;
  const originalMapAppKey = process.env.REACT_APP_KAKAO_MAP_APP_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    loadKakaoMapSdk.mockRejectedValue(new Error("KAKAO_MAP_KEY_MISSING"));
    estimateRoute.mockResolvedValue({ distanceMeters: 1784, durationSeconds: 1759, travelMode: "WALK" });
    fetchStationLocations.mockResolvedValue([{ stationId: "station-1", name: "성수역 3번 출구", latitude: 37.544, longitude: 127.056 }]);
    fetchStationDetail.mockResolvedValue({ stationId: "station-1", name: "성수역 3번 출구", latitude: 37.544, longitude: 127.056, availableBikeCount: 8, collectedAt: "2026-08-14T10:32:00+09:00", inventoryStatus: "NORMAL" });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: originalGeolocation });
    if (originalMapAppKey === undefined) delete process.env.REACT_APP_KAKAO_MAP_APP_KEY;
    else process.env.REACT_APP_KAKAO_MAP_APP_KEY = originalMapAppKey;
  });

  test("두 장소가 선택되면 경로와 예상시간을 자동 계산한다", async () => {
    const onDurationChange = jest.fn();
    renderPanel({ selectedPlaces, onDurationChange });
    await waitFor(() => expect(estimateRoute).toHaveBeenCalledWith(expect.objectContaining({ travelMode: "WALK" })));
    expect(await screen.findByText("1,784m")).toBeInTheDocument();
    expect(screen.getByText("30분")).toBeInTheDocument();
    expect(onDurationChange).toHaveBeenCalledWith(30);
  });

  test("선택 전에는 경로 요청을 차단하고 fallback을 유지한다", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "경로 확인" }));
    expect(await screen.findByText("출발지와 목적지를 검색 결과에서 선택해 주세요.")).toBeInTheDocument();
    expect(estimateRoute).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "천호동 이동 경로와 추천 대여소 지도" })).toBeInTheDocument();
  });

  test("위치 거부와 시간초과 메시지를 구분한다", () => {
    expect(locationErrorMessage({ code: 1 })).toContain("거부");
    expect(locationErrorMessage({ code: 3 })).toContain("초과");
  });

  test("내 위치 확인 성공 시 마커를 갱신하고 지도 중심을 이동한다", async () => {
    process.env.REACT_APP_KAKAO_MAP_APP_KEY = "test-key";
    const adapter = { setCenter: jest.fn(), setLevel: jest.fn(), setMapType: jest.fn(), setPoints: jest.fn(), setStations: jest.fn(), showStationOverlay: jest.fn() };
    createKakaoMapAdapter.mockReturnValue(adapter);
    loadKakaoMapSdk.mockResolvedValue({});
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn((success) => success({ coords: { latitude: 37.5665, longitude: 126.978 } })),
      },
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "내 위치 확인" }));

    expect(await screen.findByText("현재 위치를 지도에 표시했습니다.")).toBeInTheDocument();
    await waitFor(() => expect(adapter.setPoints).toHaveBeenCalledWith(expect.objectContaining({
      current: { latitude: 37.5665, longitude: 126.978 },
    })));
    expect(adapter.setCenter).toHaveBeenCalledWith({ latitude: 37.5665, longitude: 126.978 });
  });

  test("대여소 토글을 켜면 위치 목록을 한 번 로드하고 지도 adapter에 전달한다", async () => {
    process.env.REACT_APP_KAKAO_MAP_APP_KEY = "test-key";
    const adapter = { setCenter: jest.fn(), setLevel: jest.fn(), setMapType: jest.fn(), setPoints: jest.fn(), setStations: jest.fn(), showStationOverlay: jest.fn() };
    createKakaoMapAdapter.mockReturnValue(adapter);
    loadKakaoMapSdk.mockResolvedValue({});

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "대여소 표시" }));

    await waitFor(() => expect(fetchStationLocations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(adapter.setStations).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ stationId: "station-1" })]), expect.any(Function)
    ));
    fireEvent.click(screen.getByRole("button", { name: "대여소 숨기기" }));
    await waitFor(() => expect(adapter.setStations).toHaveBeenLastCalledWith([], expect.any(Function)));
  });

  test("대여소 핀 선택은 조회 중과 조회 성공 말풍선을 순서대로 표시한다", async () => {
    process.env.REACT_APP_KAKAO_MAP_APP_KEY = "test-key";
    let resolveDetail;
    fetchStationDetail.mockReturnValue(new Promise((resolve) => { resolveDetail = resolve; }));
    const adapter = { setCenter: jest.fn(), setLevel: jest.fn(), setMapType: jest.fn(), setPoints: jest.fn(), setStations: jest.fn(), showStationOverlay: jest.fn() };
    createKakaoMapAdapter.mockReturnValue(adapter);
    loadKakaoMapSdk.mockResolvedValue({});

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "대여소 표시" }));
    await waitFor(() => expect(adapter.setStations.mock.calls.some(([stations]) => stations.length > 0)).toBe(true));
    const onStationSelected = adapter.setStations.mock.calls.find(([stations]) => stations.length > 0)[1];
    onStationSelected({ stationId: "station-1", name: "성수역 3번 출구", latitude: 37.544, longitude: 127.056 });

    expect(adapter.showStationOverlay).toHaveBeenCalledWith(expect.objectContaining({ inventoryStatus: "LOADING" }));
    resolveDetail({ stationId: "station-1", name: "성수역 3번 출구", latitude: 37.544, longitude: 127.056, availableBikeCount: 8, inventoryStatus: "NORMAL" });
    await waitFor(() => expect(adapter.showStationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ availableBikeCount: 8 })));
  });

  test("위치 미지원과 권한 거부를 사용자에게 안내한다", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    const { rerender } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "내 위치 확인" }));
    expect(await screen.findByText("이 브라우저는 현재 위치를 지원하지 않습니다.")).toBeInTheDocument();

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: jest.fn((success, error) => error({ code: 1 })) },
    });
    rerender(<MapRoutePanel travelMode="도보" selectedPlaces={{ origin: null, destination: null }} fallbackImage="fallback.png" />);
    fireEvent.click(screen.getByRole("button", { name: "내 위치 확인" }));
    expect(await screen.findByText("현재 위치 권한이 거부되었습니다.")).toBeInTheDocument();
  });

  test("도착시각은 Asia/Seoul 형식으로 계산한다", () => {
    expect(formatArrival(3600, new Date("2026-08-13T00:00:00Z"))).toBe("10:00");
  });
});
