import {
  createConsumerJourneyAdapter,
  toCurrentEvidenceSaveRequest,
  toNaturalLanguageRequest,
  toStructuredReplanRequest,
} from "./consumerJourneyAdapter";

const place = (id, name) => ({ placeId: id, displayName: name, latitude: 37.5, longitude: 127.0 });

test("planner sends the sole free-text entry through the approved natural-language API", async () => {
  const api = { planJourney: jest.fn().mockResolvedValue({ decisionId: "d1" }) };
  const adapter = createConsumerJourneyAdapter(api);
  await adapter.planNaturalLanguage("  성수에서 한강을 달리고 싶어요  ", {
    origin: place("o", "성수"), destination: place("d", "서울숲"), departureAt: "2030-09-03T10:00:00+09:00",
    maxJourneyMinutes: 120, requiredBikeCount: 0,
  });
  expect(api.planJourney).toHaveBeenCalledWith(expect.objectContaining({
    requestMode: "NATURAL_LANGUAGE", naturalLanguageText: "성수에서 한강을 달리고 싶어요", requiredBikeCount: 0,
  }));
});

test("structured clarification and replanning never resend free text", () => {
  const decision = { decisionId: "d1", revision: 2, normalizedIntent: {
    origin: place("o", "성수"), destination: null, departureAt: "2030-09-03T01:00:00.000Z",
    maxJourneyMinutes: 90, requiredBikeCount: 1, preferences: { scenery: "HIGH" }, avoid: [],
  } };
  const request = toStructuredReplanRequest(decision, { destination: place("d", "서울숲") });
  expect(request).toEqual(expect.objectContaining({ requestMode: "FORM", expectedRevision: 2, destination: place("d", "서울숲") }));
  expect(request).not.toHaveProperty("naturalLanguageText");
});

test("save payload retains replay conditions but excludes evidence snapshots", () => {
  const decision = { normalizedIntent: {
    origin: place("o", "성수"), destination: place("d", "서울숲"), requiredBikeCount: 2, maxJourneyMinutes: 90,
    preferences: {}, avoid: ["RAIN"], constraints: { availableMinutes: 120, themes: ["RIVER"], stopCount: 2, routeMode: "SHORTEST" },
    aiIntent: { totalMinutes: 120, requiredBikeCount: 2, preferences: { scenery: 3 }, hardConstraints: { avoidRain: true } },
  }, unifiedPlan: { evidence: { rentalCandidates: { fake: { rentalProbability: 0.82 } } } } };
  const request = toCurrentEvidenceSaveRequest(decision);
  expect(request).toEqual(expect.objectContaining({ requiredBikeCount: 2, totalJourneyMinutes: 120, maxJourneyMinutes: 90, preferences: { scenery: 3 }, hardConstraints: ["RAIN"] }));
  expect(JSON.stringify(request)).not.toMatch(/evidence|probability|inventory|route|weather/i);
});

test("request builders preserve zero instead of treating it as missing", () => {
  expect(toNaturalLanguageRequest("계획", { maxJourneyMinutes: 0, requiredBikeCount: 0 })).toEqual(expect.objectContaining({
    maxJourneyMinutes: 0, requiredBikeCount: 0,
  }));
});

test("restored provider references use the plan endpoint placeId contract", () => {
  const restored = { providerId: "destination-provider", displayName: "여의도한강공원", latitude: 37.5264, longitude: 126.9351 };
  const expected = { placeId: restored.providerId, displayName: restored.displayName, latitude: restored.latitude, longitude: restored.longitude };
  const context = { origin: restored, destination: restored };
  expect(toNaturalLanguageRequest("한강을 달리고 싶어요", context)).toEqual(expect.objectContaining({ origin: expected, destination: expected }));
  expect(toStructuredReplanRequest({ revision: 2, normalizedIntent: context })).toEqual(expect.objectContaining({ origin: expected, destination: expected }));
  expect(toStructuredReplanRequest({ revision: 2 }, context).destination).not.toHaveProperty("providerId");
});
