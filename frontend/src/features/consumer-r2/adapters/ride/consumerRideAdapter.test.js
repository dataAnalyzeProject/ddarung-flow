import { createConsumerRideAdapter } from "./consumerRideAdapter";

const station = { stationId: "ST-10", stationNumber: "108", stationName: "성수역 3번 출구 대여소", latitude: "37.544", longitude: "127.056", availableBikeCount: 7 };
const poi = { placeId: "poi-1", name: "서울숲", address: "서울 성동구", category: "공원", latitude: "37.545", longitude: "127.04", distanceMeters: "2800" };
const route = { distanceMeters: 2800, durationSeconds: 780, travelMode: "BICYCLE", pathPoints: [{ latitude: 37.544, longitude: 127.056 }, { latitude: 37.545, longitude: 127.04 }] };

test("preserves the station and provider POI identity, coordinates, and distance", async () => {
  const adapter = createConsumerRideAdapter({
    requestStation: jest.fn().mockResolvedValue(station),
    requestPois: jest.fn().mockResolvedValue([poi]),
  });

  await expect(adapter.loadStation("ST-10")).resolves.toEqual(expect.objectContaining({ stationId: "ST-10", name: station.stationName, latitude: 37.544, longitude: 127.056 }));
  await expect(adapter.loadPois({ stationId: "ST-10", theme: "PARK" })).resolves.toEqual([
    expect.objectContaining({ placeId: "poi-1", latitude: 37.545, longitude: 127.04, distanceMeters: 2800 }),
  ]);
});

test("rejects a station response that does not match the requested station", async () => {
  const adapter = createConsumerRideAdapter({ requestStation: jest.fn().mockResolvedValue({ ...station, stationId: "ST-11" }) });
  await expect(adapter.loadStation("ST-10")).rejects.toThrow("STATION_ID_MISMATCH");
});

test("caps provider POIs at five without inventing fallback places", async () => {
  const values = Array.from({ length: 7 }, (_, index) => ({ ...poi, placeId: `poi-${index}`, name: `장소 ${index}` }));
  const adapter = createConsumerRideAdapter({ requestPois: jest.fn().mockResolvedValue(values) });
  await expect(adapter.loadPois({ stationId: "ST-10", theme: "CAFE" })).resolves.toHaveLength(5);
});

test.each(["BIKE_ONLY", "ACCESSIBLE", "SHORTEST"])("wires the %s bicycle route mode", async (routeMode) => {
  const requestRoute = jest.fn().mockResolvedValue(route);
  const adapter = createConsumerRideAdapter({ requestRoute });
  await expect(adapter.loadRoute({ station: { ...station, latitude: 37.544, longitude: 127.056 }, poi: { ...poi, latitude: 37.545, longitude: 127.04 }, routeMode })).resolves.toEqual(expect.objectContaining({ travelMode: "BICYCLE", routeMode }));
  expect(requestRoute).toHaveBeenCalledWith(expect.objectContaining({ routeMode }));
});

test("rejects a WALK response instead of relabeling it as a bicycle route", async () => {
  const adapter = createConsumerRideAdapter({ requestRoute: jest.fn().mockResolvedValue({ ...route, travelMode: "WALK" }) });
  await expect(adapter.loadRoute({ station, poi, routeMode: "BIKE_ONLY" })).rejects.toThrow("ROUTE_PROVIDER_RESPONSE_INVALID");
});

test("rejects malformed provider facts instead of synthesizing coordinates or a route", async () => {
  const adapter = createConsumerRideAdapter({ requestPois: jest.fn().mockResolvedValue([{ ...poi, placeId: null }]), requestRoute: jest.fn().mockResolvedValue({ ...route, pathPoints: [] }) });
  await expect(adapter.loadPois({ stationId: "ST-10", theme: "PARK" })).rejects.toThrow("PLACE_PROVIDER_RESPONSE_INVALID");
  await expect(adapter.loadRoute({ station, poi, routeMode: "SHORTEST" })).rejects.toThrow("ROUTE_PROVIDER_RESPONSE_INVALID");
});

test("does not coerce missing provider numbers into zero-valued facts", async () => {
  const adapter = createConsumerRideAdapter({
    requestPois: jest.fn().mockResolvedValue([{ ...poi, latitude: null }]),
    requestRoute: jest.fn().mockResolvedValue({ ...route, distanceMeters: null }),
  });
  await expect(adapter.loadPois({ stationId: "ST-10", theme: "PARK" })).rejects.toThrow("PLACE_PROVIDER_RESPONSE_INVALID");
  await expect(adapter.loadRoute({ station, poi, routeMode: "BIKE_ONLY" })).rejects.toThrow("ROUTE_PROVIDER_RESPONSE_INVALID");
});

test("sends exact live endpoint request shapes", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => station })
    .mockResolvedValueOnce({ ok: true, json: async () => [poi] })
    .mockResolvedValueOnce({ ok: true, json: async () => route });
  const adapter = createConsumerRideAdapter();
  const loadedStation = await adapter.loadStation("ST-10");
  const [loadedPoi] = await adapter.loadPois({ stationId: "ST-10", theme: "RIVER" });
  await adapter.loadRoute({ station: loadedStation, poi: loadedPoi, routeMode: "ACCESSIBLE" });

  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/v1\/stations\/ST-10$/);
  expect(fetch.mock.calls[1][0]).toContain("/api/v1/places/nearby?stationId=ST-10&theme=RIVER&limit=5");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    originLatitude: 37.544,
    originLongitude: 127.056,
    destinationLatitude: 37.545,
    destinationLongitude: 127.04,
    travelMode: "BICYCLE",
    routeMode: "ACCESSIBLE",
  });
});
