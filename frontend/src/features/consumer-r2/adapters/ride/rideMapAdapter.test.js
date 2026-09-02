import { loadKakaoMapSdk } from "../../../map/kakaoMapApi.js";
import { createRideMapAdapter } from "./rideMapAdapter";

jest.mock("../../../map/kakaoMapApi.js", () => ({ loadKakaoMapSdk: jest.fn() }));

test("keeps the station marker inert while POI markers remain keyboard-selectable", async () => {
  const contents = [];
  const maps = {
    CustomOverlay: jest.fn(function CustomOverlay({ content }) {
      contents.push(content);
      this.setMap = jest.fn();
    }),
    LatLng: jest.fn(function LatLng(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }),
    Map: jest.fn(function Map() { this.setBounds = jest.fn(); this.setCenter = jest.fn(); }),
  };
  loadKakaoMapSdk.mockResolvedValue(maps);
  const onSelectPoi = jest.fn();
  const adapter = await createRideMapAdapter(document.createElement("div"), { onSelectPoi });
  const stationValue = { name: "성수역 대여소", latitude: 37.544, longitude: 127.056 };
  const poiValue = { placeId: "poi-1", name: "서울숲", latitude: 37.545, longitude: 127.04 };

  adapter.setData({ station: stationValue, pois: [poiValue] });

  expect(contents[0].querySelector("button")).toBeNull();
  expect(contents[0].querySelector("span")).toHaveTextContent("성수역 대여소");
  const poiButton = contents[1].querySelector("button");
  expect(poiButton).toHaveAttribute("type", "button");
  poiButton.click();
  expect(onSelectPoi).toHaveBeenCalledWith(poiValue);
});
