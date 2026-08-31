import { render, screen, waitFor } from "@testing-library/react";
import StationLocationMiniMap from "./StationLocationMiniMap";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi";

jest.mock("../../map/kakaoMapApi", () => ({ createKakaoMapAdapter: jest.fn(), loadKakaoMapSdk: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders one read-only station marker with existing coordinates", async () => {
  const setStations = jest.fn();
  loadKakaoMapSdk.mockResolvedValue({});
  createKakaoMapAdapter.mockReturnValue({ setStations });
  render(<StationLocationMiniMap station={{ stationId: "ST-10", stationName: "테스트", latitude: 37.5, longitude: 127 }} />);
  await waitFor(() => expect(setStations).toHaveBeenCalledWith([expect.objectContaining({ stationId: "ST-10", latitude: 37.5, longitude: 127 })]));
  expect(createKakaoMapAdapter).toHaveBeenCalledTimes(1);
});

test("shows a calm fallback for invalid coordinates or SDK failure", async () => {
  const { rerender } = render(<StationLocationMiniMap station={{ stationId: "ST-10", latitude: "", longitude: 127 }} />);
  expect(screen.getByText("지도 정보를 표시할 수 없습니다.")).toBeInTheDocument();
  rerender(<StationLocationMiniMap station={{ stationId: "ST-10", latitude: null, longitude: 127 }} />);
  expect(screen.getByText("지도 정보를 표시할 수 없습니다.")).toBeInTheDocument();
  loadKakaoMapSdk.mockRejectedValueOnce(new Error("KAKAO_MAP_SDK_FAILED"));
  rerender(<StationLocationMiniMap station={{ stationId: "ST-10", latitude: 37.5, longitude: 127 }} />);
  expect(await screen.findByText("지도 정보를 표시할 수 없습니다.")).toBeInTheDocument();
  expect(screen.queryByText("KAKAO_MAP_SDK_FAILED")).not.toBeInTheDocument();
});

test("does not create a map after the component unmounts", async () => {
  let resolveSdk;
  loadKakaoMapSdk.mockReturnValue(new Promise((resolve) => {
    resolveSdk = resolve;
  }));
  const { unmount } = render(<StationLocationMiniMap station={{ stationId: "ST-10", latitude: 37.5, longitude: 127 }} />);
  unmount();
  resolveSdk({});
  await Promise.resolve();
  expect(createKakaoMapAdapter).not.toHaveBeenCalled();
});
