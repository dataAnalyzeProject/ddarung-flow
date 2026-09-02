import {
  getJourney,
  planJourney,
  replanJourney,
  saveJourney,
  searchJourneyPlaces,
} from "../../../journey/api/journeyApi.js";

const DEFAULT_API = { getJourney, planJourney, replanJourney, saveJourney, searchJourneyPlaces };

export function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

export function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toNaturalLanguageRequest(text, context = {}) {
  return {
    requestMode: "NATURAL_LANGUAGE",
    naturalLanguageText: text.trim(),
    origin: context.origin ?? null,
    destination: context.destination ?? null,
    departureAt: toIsoDate(context.departureAt),
    maxJourneyMinutes: hasValue(context.maxJourneyMinutes) ? Number(context.maxJourneyMinutes) : null,
    requiredBikeCount: hasValue(context.requiredBikeCount) ? Number(context.requiredBikeCount) : null,
    preferences: context.preferences || {},
    avoid: context.avoid || [],
    ...(context.constraints ? { constraints: context.constraints } : {}),
  };
}

export function toStructuredReplanRequest(decision, changes = {}) {
  const intent = decision?.normalizedIntent || {};
  const departureAt = toIsoDate(changes.departureAt ?? intent.departureAt ?? intent.startAt);
  const maxJourneyMinutes = changes.maxJourneyMinutes ?? intent.maxJourneyMinutes ?? intent.totalMinutes;
  const requiredBikeCount = changes.requiredBikeCount ?? intent.requiredBikeCount;
  return {
    requestMode: "FORM",
    origin: changes.origin ?? intent.origin ?? null,
    destination: changes.destination ?? intent.destination ?? null,
    departureAt,
    maxJourneyMinutes: hasValue(maxJourneyMinutes) ? Number(maxJourneyMinutes) : null,
    requiredBikeCount: hasValue(requiredBikeCount) ? Number(requiredBikeCount) : null,
    preferences: changes.preferences ?? intent.preferences ?? {},
    avoid: changes.avoid ?? intent.avoid ?? intent.hardConstraints ?? [],
    expectedRevision: decision?.revision,
    ...(changes.constraints ?? intent.constraints ? { constraints: changes.constraints ?? intent.constraints } : {}),
  };
}

export function toCurrentEvidenceSaveRequest(decision) {
  const intent = decision?.normalizedIntent || {};
  const aiIntent = intent.aiIntent || {};
  const constraints = intent.constraints || {};
  const place = (value) => value ? {
    providerId: value.providerId ?? value.placeId,
    displayName: value.displayName,
    latitude: value.latitude,
    longitude: value.longitude,
  } : null;
  const origin = intent.origin ?? aiIntent.origin;
  const destination = intent.destination ?? aiIntent.destination;
  const maxJourneyMinutes = intent.maxJourneyMinutes ?? aiIntent.totalMinutes ?? constraints.availableMinutes;
  const requestedTotal = constraints.availableMinutes ?? intent.totalJourneyMinutes ?? intent.totalMinutes ?? aiIntent.totalMinutes ?? maxJourneyMinutes;
  const totalJourneyMinutes = hasValue(requestedTotal) && hasValue(maxJourneyMinutes)
    ? Math.max(Number(requestedTotal), Number(maxJourneyMinutes)) : requestedTotal;
  const preferences = Object.keys(intent.preferences || {}).length ? intent.preferences : aiIntent.preferences || {};
  const hardConstraints = Array.isArray(intent.hardConstraints) ? intent.hardConstraints
    : Array.isArray(intent.avoid) ? intent.avoid : [];
  return {
    displayName: destination?.displayName || origin?.displayName || "저장한 AI 계획",
    origin: place(origin),
    destination: place(destination),
    requiredBikeCount: intent.requiredBikeCount ?? aiIntent.requiredBikeCount,
    totalJourneyMinutes,
    maxJourneyMinutes,
    preferences,
    hardConstraints,
  };
}

export function createConsumerJourneyAdapter(api = DEFAULT_API) {
  return {
    searchPlaces(query) {
      return api.searchJourneyPlaces(query);
    },
    planNaturalLanguage(text, context) {
      return api.planJourney(toNaturalLanguageRequest(text, context));
    },
    loadDecision(decisionId) {
      return api.getJourney(decisionId);
    },
    answerClarification(decision, answer) {
      return api.replanJourney(decision.decisionId, toStructuredReplanRequest(decision, answer));
    },
    replan(decision, changes) {
      return api.replanJourney(decision.decisionId, toStructuredReplanRequest(decision, changes));
    },
    saveCurrentConditions(decision) {
      const idempotencyKey = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      return api.saveJourney(toCurrentEvidenceSaveRequest(decision), idempotencyKey);
    },
  };
}

export const consumerJourneyAdapter = createConsumerJourneyAdapter();
