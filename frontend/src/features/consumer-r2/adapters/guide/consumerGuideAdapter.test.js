import {
  buildGuideRequest,
  createConsumerGuideAdapter,
  normalizeGuideResponse,
} from "./consumerGuideAdapter.js";

const normalEvidence = {
  rentalCandidates: {
    "rental:ST-4": {
      evidenceId: "rental:ST-4", source: "core-on-demand-prediction", status: "NORMAL",
      textFacts: { stationName: "성수역 3번 출구", availabilityLevel: "HIGH", inventoryStatus: "NORMAL", inventoryCollectedAt: "2026-09-03T13:32:00+09:00" },
      numericFacts: { rentalProbability: 0.82, availableBikeCount: 7 },
    },
  },
  weather: {
    "weather:ST-4": { evidenceId: "weather:ST-4", source: "kma-short-forecast", status: "NORMAL", textFacts: { skyStatus: "CLEAR" }, numericFacts: { temperatureCelsius: 25.3 } },
  },
  airQuality: {
    "air-quality:ST-4": { evidenceId: "air-quality:ST-4", source: "air-korea", status: "NORMAL", textFacts: { khaiGrade: "GOOD", pm25Grade: "MODERATE" }, numericFacts: { khai: 32, pm25: 18 } },
  },
  pois: {
    "poi:POI-1": { evidenceId: "poi:POI-1", source: "kakao-local", status: "NORMAL", textFacts: { name: "서울숲", category: "공원", address: "서울 성동구" }, numericFacts: { distanceMeters: 850 } },
  },
  routes: {},
};

const normalResponse = {
  stationId: "ST-4", status: "NORMAL", aiStatus: "AVAILABLE", aiCode: null,
  evidence: normalEvidence,
  guideSummary: "지금 출발하기 좋은 조건이에요.",
  rationale: "확인된 대여소와 주변 장소를 함께 살폈습니다.",
  rationaleTags: ["EVIDENCE_BACKED"], warnings: [],
  itineraryPreview: [{ poiId: "poi:POI-1", stayMinutes: 30, rationale: "잠시 머무르기 좋습니다." }],
};

test.each(["FREE", "EXPIRED", "PROCESSING"])("gates %s before any AI or CSRF request", async (status) => {
  const api = { fetchSubscription: jest.fn().mockResolvedValue({ status }), postGuide: jest.fn() };
  const adapter = createConsumerGuideAdapter(api);

  await expect(adapter.load({ stationId: "ST-4" })).resolves.toEqual({ accessState: status, guide: null });
  expect(api.postGuide).not.toHaveBeenCalled();
});

test("checks ACTIVE entitlement first and sends only the approved structured request", async () => {
  const api = { fetchSubscription: jest.fn().mockResolvedValue({ status: "ACTIVE" }), postGuide: jest.fn().mockResolvedValue(normalResponse) };
  const adapter = createConsumerGuideAdapter(api);

  const result = await adapter.load({ stationId: "ST-4", journeyDecisionId: "JRN-1", poiTheme: "PARK", poiLimit: 2 });

  expect(api.fetchSubscription.mock.invocationCallOrder[0]).toBeLessThan(api.postGuide.mock.invocationCallOrder[0]);
  expect(api.postGuide).toHaveBeenCalledWith(buildGuideRequest({ stationId: "ST-4", journeyDecisionId: "JRN-1", poiTheme: "PARK", poiLimit: 2 }));
  expect(result.guide).toEqual(expect.objectContaining({ hasExistingPlan: true, scheduleCta: "내 AI 일정 보기" }));
  expect(result.guide.ai.itinerary[0]).toEqual(expect.objectContaining({ name: "서울숲", distanceMeters: 850, stayMinutes: 30 }));
});

test("keeps factual evidence and discards every AI field when the provider is unavailable", () => {
  const result = normalizeGuideResponse({
    ...normalResponse,
    status: "PARTIAL", aiStatus: "UNAVAILABLE", aiCode: "AI_PROVIDER_UNAVAILABLE",
    guideSummary: "표시하면 안 되는 요약", rationale: "표시하면 안 되는 근거",
  });

  expect(result.factualPartial).toBe(true);
  expect(result.facts.rental.numeric.availableBikeCount).toBe(7);
  expect(result.facts.weather.numeric.temperatureCelsius).toBe(25.3);
  expect(result.facts.airQuality.numeric.pm25).toBe(18);
  expect(result.ai).toEqual({ summary: null, rationale: null, rationaleTags: [], itinerary: [] });
});

test("preserves normal zero separately from missing facts and never invents an itinerary POI", () => {
  const result = normalizeGuideResponse({
    ...normalResponse,
    evidence: {
      ...normalEvidence,
      rentalCandidates: { "rental:ST-4": { ...normalEvidence.rentalCandidates["rental:ST-4"], numericFacts: { rentalProbability: 0, availableBikeCount: 0 } } },
    },
    itineraryPreview: [{ poiId: "poi:not-in-evidence", stayMinutes: 10, rationale: "알 수 없음" }],
  });

  expect(result.facts.rental.numeric).toEqual({ rentalProbability: 0, availableBikeCount: 0 });
  expect(result.facts.weather.numeric).not.toHaveProperty("feelsLikeCelsius");
  expect(result.ai.itinerary).toEqual([]);
});

test("treats a malformed AVAILABLE response without a server summary as AI unavailable", () => {
  const result = normalizeGuideResponse({ ...normalResponse, guideSummary: null });

  expect(result.aiStatus).toBe("UNAVAILABLE");
  expect(result.ai).toEqual({ summary: null, rationale: null, rationaleTags: [], itinerary: [] });
});

test("does not substitute evidence belonging to another station", () => {
  const result = normalizeGuideResponse({
    ...normalResponse,
    stationId: "ST-4",
    evidence: {
      ...normalEvidence,
      rentalCandidates: { "rental:ST-OTHER": { ...normalEvidence.rentalCandidates["rental:ST-4"], evidenceId: "rental:ST-OTHER" } },
      weather: { "weather:ST-OTHER": { ...normalEvidence.weather["weather:ST-4"], evidenceId: "weather:ST-OTHER" } },
      airQuality: { "air-quality:ST-OTHER": { ...normalEvidence.airQuality["air-quality:ST-4"], evidenceId: "air-quality:ST-OTHER" } },
    },
  });

  expect(result.facts.rental).toBeNull();
  expect(result.facts.weather).toBeNull();
  expect(result.facts.airQuality).toBeNull();
});
