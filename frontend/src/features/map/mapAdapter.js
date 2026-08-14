export const createFixtureMapAdapter = (stations) => ({ getStations: () => Promise.resolve(stations) });
