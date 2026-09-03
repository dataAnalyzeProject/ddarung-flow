import { PENDING_PREDICTION_KEY } from "../../../login/loginStorage.js";

function selectedPlace(place) {
  if (!place || typeof place !== "object") return null;
  const providerId = String(place.providerId || place.placeId || "").trim();
  const name = String(place.displayName || place.name || "").trim();
  const { latitude, longitude } = place;
  if (!providerId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { providerId, name, latitude, longitude };
}

export function restoreConsumerMainInput(saved) {
  const origin = selectedPlace(saved?.routePlaces?.origin || saved?.origin);
  const destination = selectedPlace(saved?.routePlaces?.destination || saved?.destination);
  const count = saved?.requiredBikeCount;
  return {
    input: {
      origin: origin?.name || (typeof saved?.origin === "string" ? saved.origin : saved?.origin?.displayName || ""),
      destination: destination?.name || (typeof saved?.destination === "string" ? saved.destination : saved?.destination?.displayName || ""),
      travelMode: saved?.travelMode === "WALK" ? "WALK" : "PUBLIC_TRANSIT",
      requiredBikeCount: Number.isInteger(count) && count >= 1 && count <= 5 ? count : 1,
    },
    places: { origin, destination },
  };
}

export function toConsumerMainSearchInput(input, places) {
  const origin = selectedPlace(places?.origin);
  const destination = selectedPlace(places?.destination);
  if (!origin || !destination || !["WALK", "PUBLIC_TRANSIT"].includes(input?.travelMode)
    || !Number.isInteger(input.requiredBikeCount) || input.requiredBikeCount < 1 || input.requiredBikeCount > 5) return null;
  const asReference = ({ providerId, name, latitude, longitude }) => ({ providerId, displayName: name, latitude, longitude });
  return {
    origin: asReference(origin),
    destination: asReference(destination),
    travelMode: input.travelMode,
    requiredBikeCount: input.requiredBikeCount,
  };
}

export function saveConsumerMainPendingPrediction(input, places, storage = window.sessionStorage) {
  const restored = restoreConsumerMainInput({ ...input, routePlaces: places });
  storage.setItem(PENDING_PREDICTION_KEY, JSON.stringify({ ...restored.input, routePlaces: restored.places }));
}
