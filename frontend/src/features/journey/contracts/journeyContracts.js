export const JOURNEY_INPUT_STORAGE_KEY = 'ddarung.journey.planner-input';

export const emptyPlannerInput = {
  requestMode: 'FORM', naturalLanguageText: '',
  origin: { placeId: '', displayName: '', latitude: null, longitude: null }, destination: null,
  departureAt: '', maxJourneyMinutes: 60, requiredBikeCount: 1,
  preferences: { scenery: 'MEDIUM', lowSlope: 'MEDIUM', lowCrowding: 'MEDIUM', culture: 'LOW' }, avoid: [],
};

export function placeFromName(displayName) { return { placeId: displayName.trim(), displayName: displayName.trim(), latitude: null, longitude: null }; }

export function toPlanRequest(input) {
  return { requestMode: input.requestMode, ...(input.requestMode === 'NATURAL_LANGUAGE' && input.naturalLanguageText.trim() ? { naturalLanguageText: input.naturalLanguageText.trim() } : {}), origin: input.origin, destination: input.destination, departureAt: input.departureAt || null, maxJourneyMinutes: Number(input.maxJourneyMinutes), requiredBikeCount: Number(input.requiredBikeCount), preferences: input.preferences, avoid: input.avoid };
}

export function toSaveRequest(decision) {
  const input = decision.normalizedIntent || decision.replayInput || {};
  return { displayName: input.destination?.displayName || input.origin?.displayName || '저장한 여정', origin: input.origin, destination: input.destination ?? null, requiredBikeCount: input.requiredBikeCount, totalJourneyMinutes: input.totalJourneyMinutes ?? input.maxJourneyMinutes, maxJourneyMinutes: input.maxJourneyMinutes, preferences: input.preferences || {}, hardConstraints: input.hardConstraints || input.avoid || [] };
}
