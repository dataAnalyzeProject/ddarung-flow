package com.ddarungflow.weather;

import java.time.OffsetDateTime;
import java.util.List;

public record WeatherForecastResult(
    String stationId,
    OffsetDateTime arrivalAt,
    OffsetDateTime forecastAt,
    OffsetDateTime announcedAt,
    OffsetDateTime fetchedAt,
    Double temperature,
    Integer pop,
    Integer pty,
    String skyStatus,
    Boolean isRainy,
    List<HourlyForecast> hourlyForecasts,
    WeatherStatus status
) {
    public record HourlyForecast(
        OffsetDateTime forecastAt,
        Double temperature,
        Integer pop,
        Integer pty,
        String skyStatus
    ) {}
}
