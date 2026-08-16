package com.ddarungflow.weather;

import java.time.OffsetDateTime;
import java.util.List;

@FunctionalInterface
public interface WeatherForecastProvider {
    List<WeatherForecastSelector.ForecastPoint> fetch(int nx, int ny, OffsetDateTime requestedAt);
}
