import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MapRoutePanel, { formatArrival, locationErrorMessage } from "./MapRoutePanel";
import { estimateRoute, loadKakaoMapSdk } from "./kakaoMapApi";

jest.mock("./kakaoMapApi", () => ({
  estimateRoute: jest.fn(),
  loadKakaoMapSdk: jest.fn(),
  createKakaoMapAdapter: jest.fn(),
}));

const selectedPlaces = {
  origin: { placeId: "o", name: "서울역", address: "서울 중구", latitude: 37.55, longitude: 126.97 },
  destination: { placeId: "d", name: "서울시청", address: "서울 중구", latitude: 37.56, longitude: 126.98 },
};

function renderPanel(props = {}) {
  return render(<MapRoutePanel travelMode="도보" selectedPlaces={{ origin: null, destination: null }} fallbackImage="fallback.png" {...props} />);
}

describe("INT-3.6 MapRoutePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadKakaoMapSdk.mockRejectedValue(new Error("KAKAO_MAP_KEY_MISSING"));
    estimateRoute.mockResolvedValue({ distanceMeters: 1784, durationSeconds: 1759, travelMode: "WALK" });
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

  test("도착시각은 Asia/Seoul 형식으로 계산한다", () => {
    expect(formatArrival(3600, new Date("2026-08-13T00:00:00Z"))).toBe("10:00");
  });
});
