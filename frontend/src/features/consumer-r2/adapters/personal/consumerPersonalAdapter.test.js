import { createConsumerPersonalAdapter, normalizeRecentSearch } from "./consumerPersonalAdapter";

const user = { id: "member-7" };
const search = {
  origin: { providerId: "origin-1", displayName: "서울역", latitude: 37.55, longitude: 126.97 },
  destination: { providerId: "destination-1", displayName: "광화문", latitude: 37.57, longitude: 126.98 },
  travelMode: "WALK",
  requiredBikeCount: 2,
  probability: 0.95,
  inventory: 8,
  route: { duration: 12 },
};

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

test("recent search retains only reusable input conditions", () => {
  expect(normalizeRecentSearch(search)).toEqual(expect.objectContaining({ travelMode: "WALK", requiredBikeCount: 2 }));
  expect(normalizeRecentSearch(search)).not.toHaveProperty("probability");
  expect(normalizeRecentSearch(search)).not.toHaveProperty("inventory");
  expect(normalizeRecentSearch(search)).not.toHaveProperty("route");
});

test("recent searches are account-namespaced, deduplicated, and capped at five", () => {
  const adapter = createConsumerPersonalAdapter({ storage: memoryStorage() });
  adapter.saveRecentSearch(user, search);
  adapter.saveRecentSearch(user, { ...search, requiredBikeCount: 3 });
  adapter.saveRecentSearch(user, search);
  for (let count = 1; count <= 6; count += 1) adapter.saveRecentSearch(user, { ...search, destination: { ...search.destination, providerId: `destination-${count}` } });

  expect(adapter.readRecentSearches(user)).toHaveLength(5);
  expect(adapter.readRecentSearches({ id: "member-8" })).toEqual([]);
  expect(adapter.saveRecentSearch(null, search)).toEqual([]);
});

test("archive loads current favorites and saved journey conditions, then replays through the approved endpoint", async () => {
  const request = jest.fn()
    .mockResolvedValueOnce([{ id: 1, stationId: 10 }])
    .mockResolvedValueOnce([{ savedJourneyId: "saved-1", replayInput: {} }])
    .mockResolvedValueOnce([{ stationId: "station-internal-10", stationNumber: "10" }]);
  const mutation = jest.fn().mockResolvedValue({ decisionId: "decision-1" });
  const adapter = createConsumerPersonalAdapter({ api: { request, mutation }, storage: memoryStorage() });

  await expect(adapter.loadArchive()).resolves.toEqual(expect.objectContaining({ favorites: [{ id: 1, stationId: 10, currentStationId: "station-internal-10" }] }));
  await adapter.replaySavedJourney("saved-1", "2026-09-03T09:00:00.000Z");
  expect(mutation).toHaveBeenCalledWith("/api/v1/saved-journeys/saved-1/replay", { departureAt: "2026-09-03T09:00:00.000Z" });
});

test("default replay departure is future-facing when the request reaches the server", async () => {
  const mutation = jest.fn().mockResolvedValue({});
  const adapter = createConsumerPersonalAdapter({ api: { mutation }, storage: memoryStorage() });
  const before = Date.now();
  await adapter.replaySavedJourney("saved-1");
  expect(new Date(mutation.mock.calls[0][1].departureAt).getTime()).toBeGreaterThanOrEqual(before + 59_000);
});

test("favorite public station numbers resolve their leading-zero current station IDs", async () => {
  const request = jest.fn()
    .mockResolvedValueOnce([{ id: 1, stationId: 102 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ stationId: "ST-4", stationNumber: "00102" }]);
  const adapter = createConsumerPersonalAdapter({ api: { request }, storage: memoryStorage() });
  await expect(adapter.loadArchive()).resolves.toEqual(expect.objectContaining({ favorites: [{ id: 1, stationId: 102, currentStationId: "ST-4" }] }));
});
