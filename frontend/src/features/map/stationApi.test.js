import { fetchStationDetail, fetchStationLocations } from "./stationApi";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test("대여소 위치와 상세 조회는 내부 API를 호출한다", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [{ stationId: "ST-1" }] })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ stationId: "ST-1", availableBikeCount: 4 }) });

  await expect(fetchStationLocations()).resolves.toEqual([{ stationId: "ST-1" }]);
  await expect(fetchStationDetail("ST-1")).resolves.toEqual(expect.objectContaining({ availableBikeCount: 4 }));
  expect(global.fetch).toHaveBeenNthCalledWith(1, "http://localhost:8080/api/v1/stations/locations");
  expect(global.fetch).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/v1/stations/ST-1");
});

test("없는 대여소는 구분 가능한 오류를 반환한다", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

  await expect(fetchStationDetail("unknown")).rejects.toThrow("STATION_NOT_FOUND");
});
