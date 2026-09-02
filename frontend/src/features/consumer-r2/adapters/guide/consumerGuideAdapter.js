import { fetchSubscription } from "../../../premium/subscriptionApi.js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
const ACCESS_STATES = new Set(["ACTIVE", "FREE", "EXPIRED", "PROCESSING"]);

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.code || "RIDING_GUIDE_REQUEST_FAILED"), {
      code: body.code,
      status: response.status,
    });
  }
  return body;
}

async function postGuide(body) {
  const csrf = await request("/api/v1/auth/csrf");
  return request("/api/v1/riding-guide/ai", {
    method: "POST",
    headers: { [csrf.headerName]: csrf.token },
    body: JSON.stringify(body),
  });
}

function firstEvidence(collection, preferredId) {
  if (!collection || typeof collection !== "object") return null;
  return collection[preferredId] || null;
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evidenceView(evidence) {
  if (!evidence || typeof evidence !== "object") return null;
  return {
    id: evidence.evidenceId ?? null,
    source: evidence.source ?? null,
    status: evidence.status ?? "UNAVAILABLE",
    sourceTimestamp: evidence.sourceTimestamp ?? null,
    text: evidence.textFacts && typeof evidence.textFacts === "object" ? evidence.textFacts : {},
    numeric: evidence.numericFacts && typeof evidence.numericFacts === "object" ? evidence.numericFacts : {},
  };
}

function normalizeStop(stop, pois) {
  const poi = evidenceView(pois?.[stop?.poiId]);
  if (!poi) return null;
  return {
    poiId: stop.poiId,
    name: poi.text.name ?? "장소 이름 확인 불가",
    category: poi.text.category ?? null,
    address: poi.text.address ?? null,
    distanceMeters: finiteOrNull(poi.numeric.distanceMeters),
    stayMinutes: finiteOrNull(stop.stayMinutes),
    rationale: stop.rationale ?? null,
  };
}

export function normalizeGuideResponse(dto, { hasExistingPlan = false } = {}) {
  const stationId = dto?.stationId ?? null;
  const evidence = dto?.evidence && typeof dto.evidence === "object" ? dto.evidence : {};
  const rental = evidenceView(firstEvidence(evidence.rentalCandidates, `rental:${stationId}`));
  const weather = evidenceView(firstEvidence(evidence.weather, `weather:${stationId}`));
  const airQuality = evidenceView(firstEvidence(evidence.airQuality, `air-quality:${stationId}`));
  const aiAvailable = dto?.aiStatus === "AVAILABLE"
    && typeof dto?.guideSummary === "string"
    && dto.guideSummary.trim().length > 0;
  const itinerary = aiAvailable
    ? (Array.isArray(dto?.itineraryPreview) ? dto.itineraryPreview : [])
      .map((stop) => normalizeStop(stop, evidence.pois))
      .filter(Boolean)
    : [];
  const places = Object.values(evidence.pois || {}).map(evidenceView).filter(Boolean);
  const evidenceStates = [rental, weather, airQuality, ...places].filter(Boolean).map((item) => item.status);

  return {
    stationId,
    status: dto?.status === "NORMAL" ? "NORMAL" : "PARTIAL",
    aiStatus: aiAvailable ? "AVAILABLE" : dto?.aiStatus === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE",
    aiCode: dto?.aiCode ?? null,
    warnings: Array.isArray(dto?.warnings) ? dto.warnings : [],
    factualPartial: dto?.status !== "NORMAL" || evidenceStates.some((status) => status !== "NORMAL"),
    facts: { rental, weather, airQuality, places },
    ai: {
      summary: aiAvailable ? (dto?.guideSummary ?? null) : null,
      rationale: aiAvailable ? (dto?.rationale ?? null) : null,
      rationaleTags: aiAvailable && Array.isArray(dto?.rationaleTags) ? dto.rationaleTags : [],
      itinerary,
    },
    hasExistingPlan,
    scheduleCta: hasExistingPlan ? "내 AI 일정 보기" : "AI로 전체 일정 만들기",
  };
}

export function buildGuideRequest({ stationId, journeyDecisionId, originLatitude, originLongitude, minutesAhead, requiredBikeCount, poiTheme = "PARK", poiLimit = 3 }) {
  return {
    stationId,
    journeyDecisionId: journeyDecisionId || null,
    originLatitude: originLatitude ?? null,
    originLongitude: originLongitude ?? null,
    minutesAhead: minutesAhead ?? null,
    requiredBikeCount: requiredBikeCount ?? null,
    poiTheme: poiTheme || null,
    poiLimit: poiTheme ? poiLimit : null,
  };
}

export function normalizeGuideAccess(status) {
  const normalized = String(status || "").toUpperCase();
  return ACCESS_STATES.has(normalized) ? normalized : "ERROR";
}

export function createConsumerGuideAdapter(api = { fetchSubscription, postGuide }) {
  return {
    async load(input) {
      const subscription = await api.fetchSubscription();
      const accessState = normalizeGuideAccess(subscription?.status);
      if (accessState !== "ACTIVE") return { accessState, guide: null };

      const requestBody = buildGuideRequest(input);
      const dto = await api.postGuide(requestBody);
      return {
        accessState,
        guide: normalizeGuideResponse(dto, { hasExistingPlan: Boolean(requestBody.journeyDecisionId) }),
      };
    },
  };
}

export const consumerGuideAdapter = createConsumerGuideAdapter();
