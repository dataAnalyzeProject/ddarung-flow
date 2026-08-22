// Shared pure formatting helpers for RidingGuidePage's card components.
// No network fetch, App wiring, or authentication belongs in this file.

export function formatClockTime(isoString) {
  if (!isoString) return null;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatPercent(value) {
  return value === null || value === undefined ? null : `${Math.round(value * 100)}%`;
}

export function formatDistance(meters) {
  if (meters === null || meters === undefined) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

export function formatInventoryCount(inventory) {
  if (!inventory) return "정보 없음";
  if (inventory.inventoryStatus === "MISSING") return "정보 없음";
  if (inventory.inventoryStatus === "UNAVAILABLE") return "조회 불가";
  if (inventory.availableBikeCount === null || inventory.availableBikeCount === undefined) return "정보 없음";
  return `${inventory.availableBikeCount}대`;
}
