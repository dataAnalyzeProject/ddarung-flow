import { adaptCandidateResponse } from "./adaptCandidateResponse";

describe("adaptCandidateResponse", () => {
  const dto = {
    stationId: "ST-1",
    stationName: "성수역 3번 출구",
    latitude: 37.51,
    longitude: 127.01,
    distanceMeters: 120,
    durationSeconds: 720,
    arrivalAt: "2026-08-15T09:41:00+09:00",
    predictionTargetAt: "2026-08-15T10:00:00+09:00",
    targetOffsetMinutes: 19,
    featureAsOf: "2026-08-15T09:00:00+09:00",
    horizonMinutes: 60,
    availabilityLevel: "HIGH",
    predictionProbability: 0.87,
    probabilities: { atLeast1: 0.93, atLeast2: 0.87, atLeast3: 0.76, atLeast4: 0.61, atLeast5: 0.45 },
    availableBikeCount: 8,
    inventoryCollectedAt: "2026-08-15T09:02:10+09:00",
    inventoryStatus: "NORMAL",
    generatedAt: "2026-08-15T09:03:00+09:00",
    expiresAt: "2026-08-15T11:00:00+09:00",
    predictionStatus: "NORMAL",
    modelVersion: "availability-v1",
    requiredBikeCount: 2,
  };

  it("maps a backend candidate DTO into the PredictionResults candidate shape", () => {
    const result = adaptCandidateResponse([dto], { requiredBikeCount: 2, requestedAt: "2026-08-15T09:01:00+09:00" });

    expect(result.requiredBikeCount).toBe(2);
    expect(result.requestedAt).toBe("2026-08-15T09:01:00+09:00");
    expect(result.selectedStationId).toBe("ST-1");
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    expect(candidate).toEqual(expect.objectContaining({ latitude: 37.51, longitude: 127.01 }));
    expect(candidate.selectedProbability).toBe(0.87);
    expect(candidate.horizonOutlook).toBeNull();
    expect(candidate.probabilities).toEqual({ atLeast1: 0.93, atLeast2: 0.87, atLeast3: 0.76, atLeast4: 0.61, atLeast5: 0.45 });
    expect(candidate.currentInventory).toEqual({
      availableBikeCount: 8,
      collectedAt: "2026-08-15T09:02:10+09:00",
      inventoryStatus: "NORMAL",
    });
    expect(candidate.predictionStatus).toBe("NORMAL");
    expect(candidate.requiredBikeCount).toBe(2);
  });

  it("passes horizonOutlook through without changing other candidate mappings", () => {
    const horizonOutlook = [{ horizonMinutes: 60, predictionTargetAt: "2026-08-15T10:00:00+09:00", probability: 0.87, availabilityLevel: "HIGH", isSelected: true }];
    const result = adaptCandidateResponse([{ ...dto, horizonOutlook }]);

    expect(result.candidates[0]).toEqual(expect.objectContaining({
      stationId: dto.stationId,
      selectedProbability: dto.predictionProbability,
      horizonOutlook,
      probabilities: { atLeast1: 0.93, atLeast2: 0.87, atLeast3: 0.76, atLeast4: 0.61, atLeast5: 0.45 },
    }));
  });

  it("handles TOO_SOON candidates with null probability/probabilities", () => {
    const tooSoonDto = { ...dto, predictionProbability: null, probabilities: null, predictionStatus: "TOO_SOON", availabilityLevel: null };
    const result = adaptCandidateResponse([tooSoonDto], { requiredBikeCount: 1 });

    expect(result.candidates[0].selectedProbability).toBeNull();
    expect(result.candidates[0].probabilities).toBeNull();
    expect(result.candidates[0].predictionStatus).toBe("TOO_SOON");
  });

  it("returns an empty candidates array for an empty response", () => {
    const result = adaptCandidateResponse([], { requiredBikeCount: 1 });
    expect(result.candidates).toEqual([]);
    expect(result.selectedStationId).toBeNull();
  });
});
