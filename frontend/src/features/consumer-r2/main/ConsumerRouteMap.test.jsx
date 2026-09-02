import { render, screen, waitFor } from "@testing-library/react";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi.js";
import ConsumerRouteMap from "./ConsumerRouteMap.jsx";

jest.mock("../../map/kakaoMapApi.js", () => ({
  createKakaoMapAdapter: jest.fn(),
  loadKakaoMapSdk: jest.fn(),
}));

const point = { latitude: 37.55, longitude: 127.04 };
const candidate = {
  latitude: 37.58,
  longitude: 127.07,
  routeDetail: { distanceMeters: 800, durationSeconds: 600, pathPoints: [point, { latitude: 37.56, longitude: 127.05 }] },
};

test("reports a map SDK failure as map-only unavailability", async () => {
  loadKakaoMapSdk.mockRejectedValue(new Error("KAKAO_MAP_SDK_FAILED"));
  render(<ConsumerRouteMap candidate={candidate} origin={point} destination={{ latitude: 37.57, longitude: 127.06 }} />);

  expect(await screen.findByText("지도만 불러오지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByText("예측 결과와 경로 요약은 그대로 확인할 수 있습니다.")).toBeInTheDocument();
});

test("uses the selected candidate as the map destination marker", async () => {
  const adapter = { setPoints: jest.fn(), setRoutePath: jest.fn() };
  loadKakaoMapSdk.mockResolvedValue({});
  createKakaoMapAdapter.mockReturnValue(adapter);
  render(<ConsumerRouteMap candidate={candidate} origin={point} destination={{ latitude: 37.57, longitude: 127.06 }} />);

  await waitFor(() => expect(adapter.setPoints).toHaveBeenCalledWith({ origin: point, destination: { latitude: 37.58, longitude: 127.07 } }));
});
