import { adaptConsumerMainResponse, buildConsumerMainRequest } from "./consumerMainAdapter";

const routeDetail = {
  distanceMeters: 820,
  durationSeconds: 660,
  travelMode: "PUBLIC_TRANSIT",
  pathPoints: [{ latitude: 37.55, longitude: 127.04 }, { latitude: 37.56, longitude: 127.05 }],
  transfers: 1,
  fare: 1400,
  steps: [{ type: "SUBWAY", guidance: "2호선 탑승", durationSeconds: 420, pathPoints: [] }],
};

const normal = {
  stationId: "ST-1",
  stationName: "서울숲역 2번 출구",
  latitude: 37.55,
  longitude: 127.04,
  predictionProbability: 0.88,
  predictionStatus: "NORMAL",
  availabilityLevel: "HIGH",
  routeStatus: "NORMAL",
  routeDetail,
  distanceMeters: 820,
  durationSeconds: 660,
  arrivalAt: "2026-09-02T18:20:00+09:00",
};

test("keeps one normalized route evidence object for every result view", () => {
  const result = adaptConsumerMainResponse([{ ...normal, distanceMeters: 9999, durationSeconds: 9999 }], { requiredBikeCount: 2 });

  expect(result.viewState).toBe("RESULT");
  expect(result.candidates[0]).toEqual(expect.objectContaining({ probability: 0.88, routeStatus: "NORMAL", requiredBikeCount: 2, distanceMeters: 820, durationSeconds: 660 }));
  expect(result.candidates[0].routeDetail).toEqual(expect.objectContaining({ distanceMeters: 820, transfers: 1 }));
});

test("preserves unavailable route values as a visible partial result instead of fake zeroes", () => {
  const result = adaptConsumerMainResponse([{ ...normal, stationId: "ST-2", routeStatus: "UNAVAILABLE", routeDetail: null }]);

  expect(result.viewState).toBe("PARTIAL");
  expect(result.candidates[0]).toEqual(expect.objectContaining({ distanceMeters: null, durationSeconds: null, arrivalAt: null, routeDetail: null }));
});

test("uses deterministic arrival, duration, distance, and station tie breakers", () => {
  const tied = [
    { ...normal, stationId: "ST-3", arrivalAt: "2026-09-02T18:20:00+09:00", routeDetail: { ...routeDetail, durationSeconds: 700, distanceMeters: 900 } },
    { ...normal, stationId: "ST-2", arrivalAt: "2026-09-02T18:20:00+09:00", routeDetail: { ...routeDetail, durationSeconds: 660, distanceMeters: 900 } },
    { ...normal, stationId: "ST-1", arrivalAt: "2026-09-02T18:10:00+09:00", routeDetail: { ...routeDetail, durationSeconds: 900, distanceMeters: 1200 } },
  ];
  expect(adaptConsumerMainResponse(tied).candidates.map((candidate) => candidate.stationId)).toEqual(["ST-1", "ST-2", "ST-3"]);
});

test("preserves inventory and prediction freshness metadata including normal zero", () => {
  const result = adaptConsumerMainResponse([{ ...normal, availableBikeCount: 0, inventoryStatus: "NORMAL", inventoryCollectedAt: "2026-09-02T09:00:00+09:00", predictionTargetAt: "2026-09-02T10:00:00+09:00", horizonMinutes: 60, featureAsOf: "2026-09-02T08:55:00+09:00", expiresAt: "2026-09-02T10:05:00+09:00" }]);
  expect(result.candidates[0]).toEqual(expect.objectContaining({ availableBikeCount: 0, inventoryStatus: "NORMAL", horizonMinutes: 60 }));
  expect(result.candidates[0].inventoryCollectedAt).toBe("2026-09-02T09:00:00+09:00");
});

test("marks mixed normal and unavailable candidates as partial", () => {
  const result = adaptConsumerMainResponse([normal, { ...normal, stationId: "ST-2", predictionStatus: "UNAVAILABLE", predictionProbability: null }]);
  expect(result.viewState).toBe("PARTIAL");
});

test("builds the approved route request from completed provider selections", () => {
  expect(buildConsumerMainRequest({
    origin: { latitude: 37.5, longitude: 127 },
    destination: { latitude: 37.6, longitude: 127.1 },
    travelMode: "WALK",
    requiredBikeCount: 3,
  })).toEqual({
    originLatitude: 37.5,
    originLongitude: 127,
    destinationLatitude: 37.6,
    destinationLongitude: 127.1,
    travelMode: "WALK",
    minutesAhead: 20,
    requiredBikeCount: 3,
  });
});
