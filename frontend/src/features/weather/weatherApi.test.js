import { adaptArrivalWeather } from "./weatherApi";

describe("adaptArrivalWeather", () => {
  it("maps the backend weather response into WeatherCard fields", () => {
    const weather = adaptArrivalWeather({
      stationId: "DESTINATION", arrivalAt: "2026-08-15T18:20:00+09:00", forecastAt: "2026-08-15T19:00:00+09:00",
      announcedAt: "2026-08-15T14:00:00+09:00", fetchedAt: "2026-08-15T14:01:00+09:00", temperature: 25, pop: 60, pty: 1,
      skyStatus: "4", isRainy: true, status: "NORMAL", hourlyForecasts: [],
    }, { latitude: 37.56, longitude: 126.97 });

    expect(weather.precipitationType).toBe("RAIN");
    expect(weather.skyStatus).toBe("OVERCAST");
    expect(weather.rainGuidance).toBe(true);
  });

  it("provides a visible unavailable message", () => {
    const weather = adaptArrivalWeather({ status: "UNAVAILABLE", hourlyForecasts: [] }, null);
    expect(weather.message).toMatch("불러오지 못했습니다");
  });
});
