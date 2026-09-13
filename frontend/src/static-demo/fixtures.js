const FIXTURE_TIME = "2026-08-29T14:00:00+09:00";

export const demoUser = { id: "demo-user", displayName: "김따릉", name: "김따릉", tier: "PREMIUM" };

export const places = {
  origin: { providerId: "demo-origin", placeId: "demo-origin", name: "강남역 2번 출구", displayName: "강남역 2번 출구", address: "서울 강남구 강남대로", latitude: 37.4979, longitude: 127.0276 },
  destination: { providerId: "demo-destination", placeId: "demo-destination", name: "성수역", displayName: "성수역", address: "서울 성동구 아차산로", latitude: 37.5446, longitude: 127.0559 },
};

const routeDetail = {
  distanceMeters: 9100,
  durationSeconds: 2280,
  travelMode: "PUBLIC_TRANSIT",
  pathPoints: [places.origin, { latitude: 37.513, longitude: 127.031 }, places.destination],
  transfers: 1,
  fare: 1500,
  steps: [
    { type: "WALKING", guidance: "강남역까지 도보 이동", distanceMeters: 240, durationSeconds: 240, stops: [], vehicles: [] },
    { type: "SUBWAY", guidance: "2호선 성수역 방면 탑승", distanceMeters: 8200, durationSeconds: 1680, stops: [{ name: "강남역" }, { name: "성수역" }], vehicles: [{ name: "2호선", type: "일반" }] },
    { type: "WALKING", guidance: "대여소까지 도보 이동", distanceMeters: 660, durationSeconds: 360, stops: [], vehicles: [] },
  ],
};

export const candidates = [
  { stationId: "ST-DEMO-1", stationName: "성수역 3번 출구", latitude: 37.5448, longitude: 127.0564, predictionProbability: 0.91, predictionStatus: "NORMAL", availabilityLevel: "HIGH", routeStatus: "NORMAL", routeDetail, distanceMeters: 180, durationSeconds: 2280, arrivalAt: "2026-08-29T14:38:00+09:00", predictionTargetAt: "2026-08-29T14:38:00+09:00", requiredBikeCount: 1, availableBikeCount: 7, inventoryStatus: "NORMAL", inventoryCollectedAt: FIXTURE_TIME, horizonMinutes: 38, featureAsOf: "2026-08-29T13:55:00+09:00", expiresAt: "2026-08-29T15:00:00+09:00" },
  { stationId: "ST-DEMO-2", stationName: "성수동 카페거리", latitude: 37.5462, longitude: 127.0523, predictionProbability: 0.74, predictionStatus: "NORMAL", availabilityLevel: "MEDIUM", routeStatus: "NORMAL", routeDetail: { ...routeDetail, durationSeconds: 2460 }, distanceMeters: 410, durationSeconds: 2460, arrivalAt: "2026-08-29T14:41:00+09:00", predictionTargetAt: "2026-08-29T14:41:00+09:00", requiredBikeCount: 1, availableBikeCount: 4, inventoryStatus: "NORMAL", inventoryCollectedAt: FIXTURE_TIME, horizonMinutes: 41, featureAsOf: "2026-08-29T13:55:00+09:00", expiresAt: "2026-08-29T15:00:00+09:00" },
  { stationId: "ST-DEMO-3", stationName: "서울숲 4번 출구", latitude: 37.5431, longitude: 127.0447, predictionProbability: 0.56, predictionStatus: "NORMAL", availabilityLevel: "MEDIUM", routeStatus: "NORMAL", routeDetail: { ...routeDetail, durationSeconds: 2640 }, distanceMeters: 780, durationSeconds: 2640, arrivalAt: "2026-08-29T14:44:00+09:00", predictionTargetAt: "2026-08-29T14:44:00+09:00", requiredBikeCount: 1, availableBikeCount: 2, inventoryStatus: "DELAYED", inventoryCollectedAt: "2026-08-29T13:48:00+09:00", horizonMinutes: 44, featureAsOf: "2026-08-29T13:45:00+09:00", expiresAt: "2026-08-29T15:00:00+09:00" },
];

export const mainServices = {
  clearPendingPrediction() {},
  createSearchRecheck: () => Promise.resolve({ publicId: "demo-recheck" }),
  fetchRouteCandidates: () => Promise.resolve({ candidates }),
  fetchStationDetail: (stationId) => Promise.resolve({ stationId, availableBikeCount: 7, collectedAt: FIXTURE_TIME, inventoryStatus: "NORMAL" }),
  fetchStationLocations: () => Promise.resolve(candidates.map((candidate) => ({ stationId: candidate.stationId, stationName: candidate.stationName, latitude: candidate.latitude, longitude: candidate.longitude }))),
  getCurrentUser: () => Promise.resolve({ authenticated: true, user: demoUser }),
  loadPendingPrediction: () => ({ travelMode: "PUBLIC_TRANSIT", requiredBikeCount: 1, routePlaces: places }),
  savePendingPrediction() {},
  saveRecentSearch() {},
  searchPlaces: (query) => Promise.resolve(Object.values(places).filter((place) => place.name.includes(query))),
};

const rhythm = Array.from({ length: 7 }, (_, day) => [6, 8, 10, 12, 14, 16, 18, 20, 22].map((hour, index) => ({ dayOfWeek: day + 1, hourOfDay: hour, stockoutRate: Math.min(0.82, 0.08 + day * 0.035 + index * 0.045) }))).flat();

export const stationAdapter = {
  load: () => Promise.resolve({
    station: { stationId: "ST-DEMO-1", stationNumber: "05258", name: "성수역 3번 출구", latitude: 37.5448, longitude: 127.0564, availableBikeCount: 7, collectedAt: FIXTURE_TIME, inventoryStatus: "NORMAL" },
    rhythm: { weekdayHourly: rhythm, stockout: { medianDurationMinutes: 12, medianRecoveryMinutesToThree: 8 } },
    rhythmState: "ready",
    nearby: [{ stationId: "ST-DEMO-2", name: "성수동 카페거리" }, { stationId: "ST-DEMO-3", name: "서울숲 4번 출구" }],
    nearbyState: "ready",
    favorite: false,
    favoriteState: "ready",
  }),
  toggleFavorite: () => Promise.resolve({ id: "demo-favorite" }),
};

export const guideServices = {
  load: () => Promise.resolve({ accessState: "ACTIVE", guide: {
    stationId: "ST-DEMO-1", status: "NORMAL", aiStatus: "AVAILABLE", aiCode: null, warnings: [], factualPartial: false,
    facts: {
      rental: { status: "NORMAL", text: { stationName: "성수역 3번 출구", availabilityLevel: "HIGH", inventoryStatus: "NORMAL" }, numeric: { rentalProbability: 0.91, availableBikeCount: 7 } },
      weather: { status: "NORMAL", text: { skyStatus: "CLEAR" }, numeric: { temperatureCelsius: 25.3 } },
      airQuality: { status: "NORMAL", text: { khaiGrade: "GOOD" }, numeric: { pm25: 18 } },
      places: [{ id: "poi:1", status: "NORMAL", text: { name: "서울숲", category: "공원", address: "서울 성동구 뚝섬로" }, numeric: { distanceMeters: 850 } }],
    },
    ai: { summary: "지금 출발하기 좋은 조건이에요.", rationale: "확인된 대여소와 장소를 함께 살폈습니다.", rationaleTags: ["EVIDENCE_BACKED"], itinerary: [{ poiId: "poi:1", name: "서울숲", category: "공원", address: "서울 성동구 뚝섬로", distanceMeters: 850, stayMinutes: 30, rationale: "잠시 머무르기 좋습니다." }] },
    hasExistingPlan: false, scheduleCta: "AI로 전체 일정 만들기",
  } }),
};

const journeyPlace = (placeId, displayName, latitude, longitude) => ({ placeId, displayName, latitude, longitude });
export const journeyDecision = {
  decisionId: "DEMO-JOURNEY-1", revision: 2, status: "READY",
  normalizedIntent: { origin: journeyPlace("origin", "성수역", 37.5446, 127.0559), destination: journeyPlace("destination", "서울숲", 37.5444, 127.0374), departureAt: "2026-09-30T14:10:00+09:00", maxJourneyMinutes: 90, requiredBikeCount: 1, preferences: { scenery: 5, cafe: 4 }, avoid: [] },
  unifiedPlan: {
    status: "READY", rationale: "실제 대여소와 이동 경로 근거를 조합했습니다.", selectedRentalCandidateId: "rental:ST-DEMO-1",
    segments: [
      { segmentId: "access", type: "ACCESS", fromEvidenceId: "origin-e", toEvidenceId: "rent-e", startAt: "2026-09-30T14:10:00+09:00", endAt: "2026-09-30T14:18:00+09:00", durationSeconds: 480, distanceMeters: 550, travelMode: "WALK", pathPoints: [{ latitude: 37.5446, longitude: 127.0559 }, { latitude: 37.5448, longitude: 127.0564 }] },
      { segmentId: "rent", type: "RENT", fromEvidenceId: "rent-e", toEvidenceId: "rent-e", startAt: "2026-09-30T14:18:00+09:00", rentalFacts: { stationName: "성수역 3번 출구", rentalProbability: 0.91, requiredBikeCount: 1, availableBikeCount: 7 } },
      { segmentId: "ride", type: "RIDE", fromEvidenceId: "rent-e", toEvidenceId: "poi-e", startAt: "2026-09-30T14:20:00+09:00", endAt: "2026-09-30T14:36:00+09:00", durationSeconds: 960, distanceMeters: 3200, travelMode: "BICYCLE", pathPoints: [{ latitude: 37.5448, longitude: 127.0564 }, { latitude: 37.5444, longitude: 127.0374 }] },
      { segmentId: "visit", type: "VISIT", fromEvidenceId: "poi-e", toEvidenceId: "poi-e", startAt: "2026-09-30T14:36:00+09:00", endAt: "2026-09-30T15:06:00+09:00", stayMinutes: 30, pathPoints: [] },
    ],
    evidence: {
      rentalCandidates: { "rent-e": { evidenceId: "rent-e", source: "core-on-demand-prediction", status: "NORMAL", textFacts: { stationName: "성수역 3번 출구", availabilityLevel: "HIGH" }, numericFacts: { rentalProbability: 0.91, availableBikeCount: 7 } } },
      pois: { "poi-e": { evidenceId: "poi-e", source: "kakao-local", status: "NORMAL", textFacts: { displayName: "서울숲", address: "서울 성동구 뚝섬로" }, numericFacts: { distanceMeters: 850 } } },
      routes: { "route-e": { evidenceId: "route-e", source: "core-route-provider", status: "NORMAL", textFacts: { fromEvidenceId: "origin-e", toEvidenceId: "rent-e" }, numericFacts: { distanceMeters: 550, durationSeconds: 480 } } },
      weather: { "weather-e": { evidenceId: "weather-e", source: "kma-short-forecast", status: "NORMAL", textFacts: { isRainy: "false" }, numericFacts: { temperatureCelsius: 25.3, precipitationProbabilityPercent: 10 } } },
      airQuality: { "air-e": { evidenceId: "air-e", source: "air-korea", status: "NORMAL", textFacts: { khaiGrade: "GOOD", measurementStation: "성동구" }, numericFacts: { pm25: 18 } } },
    },
  },
};

const draftDecision = { decisionId: "DEMO-JOURNEY-1", revision: 1, status: "CLARIFICATION_REQUIRED", normalizedIntent: { aiIntent: { origin: { displayName: "성수역" }, destination: { displayName: "서울숲" }, startAt: "2026-09-30T14:10:00+09:00", totalMinutes: 90, requiredBikeCount: 1, preferences: { scenery: 5, cafe: 4 } } }, clarification: { missingFields: [] } };

export const journeyAdapter = {
  answerClarification: () => Promise.resolve(journeyDecision),
  loadDecision: () => Promise.resolve(journeyDecision),
  planNaturalLanguage: () => Promise.resolve(draftDecision),
  replan: () => Promise.resolve(journeyDecision),
  saveCurrentConditions: () => Promise.resolve({ savedJourneyId: "demo-saved" }),
  searchPlaces: (query) => Promise.resolve([query.includes("서울숲") ? journeyDecision.normalizedIntent.destination : journeyDecision.normalizedIntent.origin]),
};

export const recheckAdapter = { createPlanRecheck: () => Promise.resolve({ publicId: "demo-plan-recheck" }) };
