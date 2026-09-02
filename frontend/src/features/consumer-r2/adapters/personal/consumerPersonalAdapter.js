import { getCurrentUser, logout } from "../../../login/authApi.js";
import { fetchSubscription } from "../../../premium/subscriptionApi.js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";
const RECENT_SEARCH_PREFIX = "ddarung.consumer-r2.recent-search.v1";
const MAX_RECENT_SEARCHES = 5;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "개인 데이터를 불러오지 못했습니다."), { status: response.status, code: body.code });
  return response.status === 204 ? null : body;
}

async function mutation(path, body) {
  const csrf = await request("/api/v1/auth/csrf");
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify(body),
  });
}

function accountNamespace(user) {
  const accountId = user?.id || user?.userId || user?.providerUserId;
  return accountId ? `${RECENT_SEARCH_PREFIX}.${accountId}` : null;
}

function normalizedPlace(place) {
  if (!place || typeof place !== "object") return null;
  const providerId = String(place.providerId || place.placeId || "").trim();
  const displayName = String(place.displayName || place.name || "").trim();
  if (!providerId || !displayName) return null;
  return { providerId, displayName, latitude: Number(place.latitude), longitude: Number(place.longitude) };
}

export function normalizeRecentSearch(input) {
  const origin = normalizedPlace(input?.origin);
  const destination = normalizedPlace(input?.destination);
  const travelMode = input?.travelMode === "PUBLIC_TRANSIT" ? "PUBLIC_TRANSIT" : input?.travelMode === "WALK" ? "WALK" : null;
  const requiredBikeCount = Number(input?.requiredBikeCount);
  if (!origin || !destination || !travelMode || !Number.isInteger(requiredBikeCount) || requiredBikeCount < 1 || requiredBikeCount > 5) return null;
  return { origin, destination, travelMode, requiredBikeCount };
}

function recentKey(search) {
  return [search.origin.providerId, search.destination.providerId, search.travelMode, search.requiredBikeCount].join("|");
}

function sameStationNumber(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber) && leftNumber === rightNumber;
}

function readRecentSearches(user, storage = window.localStorage) {
  const key = accountNamespace(user);
  if (!key) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeRecentSearch).filter(Boolean).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(user, input, storage = window.localStorage) {
  const key = accountNamespace(user);
  const search = normalizeRecentSearch(input);
  if (!key || !search) return [];
  const next = [search, ...readRecentSearches(user, storage).filter((item) => recentKey(item) !== recentKey(search))].slice(0, MAX_RECENT_SEARCHES);
  storage.setItem(key, JSON.stringify(next));
  return next;
}

export function createConsumerPersonalAdapter({ api = { getCurrentUser, logout, fetchSubscription, request, mutation }, storage } = {}) {
  const browserStorage = storage || window.localStorage;
  return {
    async loadArchive() {
      const [favorites, savedJourneys] = await Promise.all([api.request("/api/v1/favorites"), api.request("/api/v1/saved-journeys")]);
      const resolvedFavorites = await Promise.all((Array.isArray(favorites) ? favorites : []).map(async (favorite) => {
        try {
          const matches = await api.request(`/api/v1/stations/search?query=${encodeURIComponent(favorite.stationId)}&limit=10`);
          const station = Array.isArray(matches) ? matches.find((item) => sameStationNumber(item.stationNumber, favorite.stationId)) : null;
          return { ...favorite, currentStationId: station?.stationId || null };
        } catch {
          return { ...favorite, currentStationId: null };
        }
      }));
      return { favorites: resolvedFavorites, savedJourneys: Array.isArray(savedJourneys) ? savedJourneys : [] };
    },
    replaySavedJourney(savedJourneyId, departureAt = new Date(Date.now() + 60_000).toISOString()) {
      return api.mutation(`/api/v1/saved-journeys/${encodeURIComponent(savedJourneyId)}/replay`, { departureAt });
    },
    readRecentSearches(user) {
      return readRecentSearches(user, browserStorage);
    },
    saveRecentSearch(user, input) {
      return saveRecentSearch(user, input, browserStorage);
    },
    async loadMyPage() {
      const auth = await api.getCurrentUser();
      if (!auth.authenticated) return { authState: "anonymous", user: null, subscription: null };
      try {
        const subscription = await api.fetchSubscription();
        return { authState: "authenticated", user: auth.user, subscription };
      } catch (error) {
        return { authState: "authenticated", user: auth.user, subscription: null, subscriptionError: error.code || "PREMIUM_STATUS_UNAVAILABLE" };
      }
    },
    logout: () => api.logout(),
  };
}

export const consumerPersonalAdapter = createConsumerPersonalAdapter();
