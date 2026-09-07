import { fetchStationDetail, fetchStationLocations } from "./stationRhythmApi.js";

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

test("fetchStationLocations requests the existing station locations endpoint", async () => {
  const locations = [{ stationId: "ST-1", stationNumber: 101, name: "서울역", latitude: 37.55, longitude: 126.97 }];
  fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(locations) });

  await expect(fetchStationLocations()).resolves.toEqual(locations);
  expect(fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/stations/locations");
});

test("fetchStationDetail encodes the station id on the existing detail endpoint", async () => {
  const detail = { stationId: "ST 1", availableBikeCount: 0, inventoryStatus: "NORMAL" };
  fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(detail) });

  await expect(fetchStationDetail("ST 1")).resolves.toEqual(detail);
  expect(fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/stations/ST%201");
});

test.each([
  [401, "AUTH_REQUIRED"],
  [404, "RHYTHM_NOT_AVAILABLE"],
  [503, "STATION_API_ERROR"],
])("preserves the existing error contract for status %s", async (status, code) => {
  fetch.mockResolvedValue({ ok: false, status, json: jest.fn().mockRejectedValue(new Error("invalid body")) });
  await expect(fetchStationLocations()).rejects.toThrow(code);
});

test("uses a server error code when one is returned", async () => {
  fetch.mockResolvedValue({ ok: false, status: 503, json: jest.fn().mockResolvedValue({ code: "STATION_SNAPSHOT_UNAVAILABLE" }) });
  await expect(fetchStationDetail("ST-1")).rejects.toThrow("STATION_SNAPSHOT_UNAVAILABLE");
});
