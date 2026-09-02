const LEVEL_LABELS = {
  HIGH: "높음",
  MEDIUM: "중간",
  LOW: "낮음",
};

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePoint(point) {
  if (!point || typeof point !== "object") return null;
  const latitude = finiteOrNull(point.latitude);
  const longitude = finiteOrNull(point.longitude);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function normalizeRouteDetail(routeDetail) {
  if (!routeDetail || typeof routeDetail !== "object") return null;
  return {
    distanceMeters: finiteOrNull(routeDetail.distanceMeters),
    durationSeconds: finiteOrNull(routeDetail.durationSeconds),
    travelMode: routeDetail.travelMode ?? null,
    pathPoints: (routeDetail.pathPoints ?? []).map(normalizePoint).filter(Boolean),
    transfers: finiteOrNull(routeDetail.transfers),
    fare: finiteOrNull(routeDetail.fare),
    steps: (routeDetail.steps ?? []).map((step) => ({
      type: step.type ?? null,
      guidance: step.guidance ?? null,
      distanceMeters: finiteOrNull(step.distanceMeters),
      durationSeconds: finiteOrNull(step.durationSeconds),
      stops: (step.stops ?? []).map((stop) => ({
        name: stop.name ?? null,
        ...normalizePoint(stop),
      })),
      vehicles: (step.vehicles ?? []).map((vehicle) => ({
        name: vehicle.name ?? null,
        type: vehicle.type ?? null,
      })),
      pathPoints: (step.pathPoints ?? []).map(normalizePoint).filter(Boolean),
    })),
  };
}

function normalizeCandidate(dto, requiredBikeCount) {
  const predictionAvailable = dto?.predictionStatus === "NORMAL";
  const routeAvailable = dto?.routeStatus === "NORMAL" && dto?.routeDetail;
  const probability = predictionAvailable ? finiteOrNull(dto.predictionProbability) : null;
  const routeDetail = routeAvailable ? normalizeRouteDetail(dto.routeDetail) : null;

  return {
    stationId: dto?.stationId ?? null,
    stationName: dto?.stationName ?? "이름을 확인할 수 없는 대여소",
    latitude: finiteOrNull(dto?.latitude),
    longitude: finiteOrNull(dto?.longitude),
    distanceMeters: routeDetail?.distanceMeters ?? null,
    durationSeconds: routeDetail?.durationSeconds ?? null,
    arrivalAt: routeAvailable ? (dto.arrivalAt ?? null) : null,
    availabilityLevel: predictionAvailable ? (dto.availabilityLevel ?? null) : null,
    availabilityLabel: predictionAvailable ? (LEVEL_LABELS[dto.availabilityLevel] ?? "확인 필요") : "확인 불가",
    probability,
    availableBikeCount: finiteOrNull(dto?.availableBikeCount),
    inventoryCollectedAt: dto?.inventoryCollectedAt ?? null,
    inventoryStatus: dto?.inventoryStatus ?? null,
    predictionStatus: dto?.predictionStatus ?? "UNAVAILABLE",
    predictionTargetAt: dto?.predictionTargetAt ?? null,
    horizonMinutes: finiteOrNull(dto?.horizonMinutes),
    featureAsOf: dto?.featureAsOf ?? null,
    expiresAt: dto?.expiresAt ?? null,
    routeStatus: routeAvailable ? "NORMAL" : (dto?.routeStatus ?? "UNAVAILABLE"),
    routeDetail,
    requiredBikeCount: finiteOrNull(dto?.requiredBikeCount) ?? requiredBikeCount,
  };
}

function compareNullable(a, b, direction = 1) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a < b ? -1 : a > b ? 1 : 0) * direction;
}

function timestampOrNull(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareCandidates(a, b) {
  return compareNullable(a.probability, b.probability, -1)
    || compareNullable(timestampOrNull(a.arrivalAt), timestampOrNull(b.arrivalAt))
    || compareNullable(a.durationSeconds, b.durationSeconds)
    || compareNullable(a.distanceMeters, b.distanceMeters)
    || String(a.stationId ?? "").localeCompare(String(b.stationId ?? ""), "ko");
}

export function adaptConsumerMainResponse(candidateDtos, { requiredBikeCount = 1 } = {}) {
  const candidates = (Array.isArray(candidateDtos) ? candidateDtos : [])
    .map((dto) => normalizeCandidate(dto, requiredBikeCount))
    .sort(compareCandidates);

  const normalCount = candidates.filter((candidate) => (
    candidate.predictionStatus === "NORMAL" && candidate.routeStatus === "NORMAL"
  )).length;

  return {
    candidates,
    selectedStationId: candidates[0]?.stationId ?? null,
    viewState: candidates.length === 0 ? "EMPTY" : normalCount === candidates.length ? "RESULT" : "PARTIAL",
  };
}

export function buildConsumerMainRequest({ origin, destination, travelMode, requiredBikeCount }) {
  return {
    originLatitude: origin.latitude,
    originLongitude: origin.longitude,
    destinationLatitude: destination.latitude,
    destinationLongitude: destination.longitude,
    travelMode,
    minutesAhead: travelMode === "WALK" ? 20 : 40,
    requiredBikeCount,
  };
}
