// 백엔드 POST /api/v1/routes/candidates(또는 /predictions/route,/direct) 응답을
// PredictionResults가 기대하는 result 셰이프로 변환한다.
// 참고: data/predictionResultMock.js의 normalResult가 목표 필드 형태다.
export function adaptCandidateResponse(candidateDtos, { requestedAt, requiredBikeCount, disclaimer } = {}) {
  const candidates = (candidateDtos ?? []).map((dto) => ({
    stationId: dto.stationId,
    stationName: dto.stationName,
    latitude: dto.latitude,
    longitude: dto.longitude,
    distanceMeters: dto.distanceMeters,
    durationSeconds: dto.durationSeconds,
    arrivalAt: dto.arrivalAt,
    predictionTargetAt: dto.predictionTargetAt,
    targetOffsetMinutes: dto.targetOffsetMinutes,
    featureAsOf: dto.featureAsOf,
    horizonMinutes: dto.horizonMinutes,
    availabilityLevel: dto.availabilityLevel,
    selectedProbability: dto.predictionProbability,
    horizonOutlook: dto.horizonOutlook ?? null,
    probabilities: dto.probabilities
      ? {
          atLeast1: dto.probabilities.atLeast1,
          atLeast2: dto.probabilities.atLeast2,
          atLeast3: dto.probabilities.atLeast3,
          atLeast4: dto.probabilities.atLeast4,
          atLeast5: dto.probabilities.atLeast5,
        }
      : null,
    currentInventory: {
      availableBikeCount: dto.availableBikeCount,
      collectedAt: dto.inventoryCollectedAt,
      inventoryStatus: dto.inventoryStatus,
    },
    requiredBikeCount: dto.requiredBikeCount,
    predictionGeneratedAt: dto.generatedAt,
    predictionExpiresAt: dto.expiresAt,
    predictionStatus: dto.predictionStatus,
    modelVersion: dto.modelVersion,
  }));

  return {
    requestedAt: requestedAt ?? new Date().toISOString(),
    requiredBikeCount: requiredBikeCount ?? candidates[0]?.requiredBikeCount ?? 1,
    selectedStationId: candidates[0]?.stationId ?? null,
    candidates,
    disclaimer: disclaimer ?? "정시 예측을 도착시각에 대응한 결과이며 실제 대여를 보장하지 않습니다.",
  };
}
