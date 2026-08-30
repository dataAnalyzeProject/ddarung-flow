export const JOURNEY_INPUT_STORAGE_KEY = 'ddarung.journey.planner-input';

export const emptyPlannerInput = {
  requestMode: 'FORM', naturalLanguageText: '',
  origin: null, destination: null,
  departureAt: '', maxJourneyMinutes: 60, requiredBikeCount: 1,
  preferences: { scenery: 'MEDIUM', lowSlope: 'MEDIUM', lowCrowding: 'MEDIUM', culture: 'LOW' }, avoid: [],
};

export function isSelectedPlace(place) {
  return Boolean(place?.placeId && place.displayName && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}

export function validatePlannerInput(input, now = Date.now()) {
  if (!isSelectedPlace(input.origin)) return '출발 장소를 검색 결과에서 선택해 주세요.';
  if (!isSelectedPlace(input.destination)) return '목적지를 검색 결과에서 선택해 주세요.';
  if (!input.departureAt) return '출발 희망 시각을 입력해 주세요.';
  const departureAt = new Date(input.departureAt);
  if (Number.isNaN(departureAt.getTime()) || departureAt.getTime() <= now) return '출발 희망 시각은 현재 이후여야 합니다.';
  const requiredBikeCount = Number(input.requiredBikeCount);
  if (!Number.isInteger(requiredBikeCount) || requiredBikeCount < 1 || requiredBikeCount > 5) return '필요한 자전거 수는 1~5대여야 합니다.';
  return '';
}

export function toPlanRequest(input) {
  return { requestMode: input.requestMode, ...(input.requestMode === 'NATURAL_LANGUAGE' && input.naturalLanguageText.trim() ? { naturalLanguageText: input.naturalLanguageText.trim() } : {}), origin: input.origin, destination: input.destination, departureAt: new Date(input.departureAt).toISOString(), maxJourneyMinutes: Number(input.maxJourneyMinutes), requiredBikeCount: Number(input.requiredBikeCount), preferences: input.preferences, avoid: input.avoid };
}

export function toSavedPlace(place) {
  if (!place) return null;
  return { providerId: place.providerId ?? place.placeId, displayName: place.displayName, latitude: place.latitude, longitude: place.longitude };
}

export function toSaveRequest(decision) {
  const input = decision.normalizedIntent || decision.replayInput || {};
  return { displayName: input.destination?.displayName || input.origin?.displayName || '저장한 여정', origin: toSavedPlace(input.origin), destination: toSavedPlace(input.destination), requiredBikeCount: input.requiredBikeCount, totalJourneyMinutes: input.totalJourneyMinutes ?? input.maxJourneyMinutes, maxJourneyMinutes: input.maxJourneyMinutes, preferences: input.preferences || {}, hardConstraints: input.hardConstraints || input.avoid || [] };
}
