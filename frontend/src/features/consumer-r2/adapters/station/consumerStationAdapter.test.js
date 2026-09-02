import { createConsumerStationAdapter } from "./consumerStationAdapter";

const station = {
  stationId: "37-2",
  stationNumber: "1002",
  name: "서울역 2번 출구",
  latitude: 37.555,
  longitude: 126.97,
};

function makeAdapter(overrides = {}) {
  return createConsumerStationAdapter({
    fetchStationDetail: jest.fn().mockResolvedValue(station),
    fetchStationRhythm: jest.fn().mockResolvedValue({ weekdayHourly: [] }),
    fetchNearbyStations: jest.fn().mockResolvedValue([{ stationId: "37-2" }, { stationId: "37-3" }]),
    loadArchive: jest.fn().mockResolvedValue([[{ id: 9, stationId: 1002 }]]),
    removeFavorite: jest.fn().mockResolvedValue(null),
    saveFavorite: jest.fn().mockResolvedValue({ id: 10, stationId: 1002 }),
    ...overrides,
  });
}

describe("consumerStationAdapter", () => {
  it("keeps rhythm, nearby, and favorite failures independent from station detail", async () => {
    const adapter = makeAdapter({
      fetchStationRhythm: jest.fn().mockRejectedValue(new Error("RHYTHM_NOT_AVAILABLE")),
      fetchNearbyStations: jest.fn().mockRejectedValue(new Error("STATION_API_ERROR")),
      loadArchive: jest.fn().mockRejectedValue(new Error("AUTH_REQUIRED")),
    });

    await expect(adapter.load("37-2")).resolves.toMatchObject({
      station,
      rhythm: null,
      rhythmState: "missing",
      nearby: [],
      nearbyState: "unavailable",
      favorite: null,
      favoriteState: "unavailable",
    });
  });

  it("removes an existing favorite and saves a new one with the public station number", async () => {
    const removeFavorite = jest.fn().mockResolvedValue(null);
    const saveFavorite = jest.fn().mockResolvedValue({ id: 10 });
    const adapter = makeAdapter({ removeFavorite, saveFavorite });

    await expect(adapter.toggleFavorite({ favorite: { id: 9 }, station })).resolves.toBeNull();
    await expect(adapter.toggleFavorite({ favorite: null, station })).resolves.toEqual({ id: 10 });
    expect(removeFavorite).toHaveBeenCalledWith(9);
    expect(saveFavorite).toHaveBeenCalledWith({ stationId: 1002, stationName: "서울역 2번 출구" });
  });
});
