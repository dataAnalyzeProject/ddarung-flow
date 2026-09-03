import { loadArchive, removeFavorite, saveFavorite } from "../../../archive/archiveApi.js";
import { fetchNearbyStations, fetchStationDetail, fetchStationRhythm } from "../../../station-detail/stationRhythmApi.js";

function stateFrom(result, missingCode) {
  if (result.status === "fulfilled") return "ready";
  return result.reason?.message === missingCode ? "missing" : "unavailable";
}

function hasCoordinates(station) {
  return station?.latitude !== null && station?.latitude !== undefined
    && station?.longitude !== null && station?.longitude !== undefined
    && Number.isFinite(Number(station.latitude)) && Number.isFinite(Number(station.longitude));
}

function favoriteForStation(favorites, station) {
  const stationNumber = Number(station?.stationNumber);
  return Array.isArray(favorites)
    ? favorites.find((favorite) => Number(favorite.stationId) === stationNumber) || null
    : null;
}

export function createConsumerStationAdapter(dependencies = {}) {
  const api = {
    fetchNearbyStations,
    fetchStationDetail,
    fetchStationRhythm,
    loadArchive,
    removeFavorite,
    saveFavorite,
    ...dependencies,
  };

  return {
    async load(stationId) {
      const station = await api.fetchStationDetail(stationId);
      const nearbyRequest = hasCoordinates(station)
        ? api.fetchNearbyStations(Number(station.latitude), Number(station.longitude))
        : Promise.reject(new Error("STATION_LOCATION_UNAVAILABLE"));
      const [rhythmResult, nearbyResult, archiveResult] = await Promise.allSettled([
        api.fetchStationRhythm(stationId),
        nearbyRequest,
        api.loadArchive(),
      ]);
      const favorites = archiveResult.status === "fulfilled" ? archiveResult.value?.[0] : [];

      return {
        station,
        rhythm: rhythmResult.status === "fulfilled" ? rhythmResult.value : null,
        rhythmState: stateFrom(rhythmResult, "RHYTHM_NOT_AVAILABLE"),
        nearby: nearbyResult.status === "fulfilled"
          ? (Array.isArray(nearbyResult.value) ? nearbyResult.value : []).filter((item) => String(item.stationId) !== String(station.stationId)).slice(0, 3)
          : [],
        nearbyState: stateFrom(nearbyResult, "STATION_LOCATION_UNAVAILABLE"),
        favorite: favoriteForStation(favorites, station),
        favoriteState: archiveResult.status === "fulfilled" ? "ready" : "unavailable",
      };
    },

    async toggleFavorite({ favorite, station }) {
      if (favorite) {
        await api.removeFavorite(favorite.id);
        return null;
      }

      const stationId = Number(station?.stationNumber);
      if (!Number.isFinite(stationId)) throw new Error("FAVORITE_STATION_ID_UNAVAILABLE");
      return api.saveFavorite({ stationId, stationName: station.name || station.stationName || "대여소" });
    },
  };
}

export const consumerStationAdapter = createConsumerStationAdapter();
