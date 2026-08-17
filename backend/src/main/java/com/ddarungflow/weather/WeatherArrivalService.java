package com.ddarungflow.weather;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
public class WeatherArrivalService {
    private static final ZoneOffset KST = ZoneOffset.ofHours(9);
    private final WeatherForecastProvider provider;
    private final Clock clock;
    private final WeatherForecastSelector selector = new WeatherForecastSelector();

    @Autowired
    public WeatherArrivalService(WeatherForecastProvider provider) { this(provider, Clock.systemUTC()); }
    WeatherArrivalService(WeatherForecastProvider provider, Clock clock) { this.provider = provider; this.clock = clock; }

    public WeatherForecastResult getArrivalWeather(BigDecimal latitude, BigDecimal longitude, OffsetDateTime arrivalAt) {
        if (latitude == null || longitude == null || arrivalAt == null) throw new IllegalArgumentException("latitude, longitude and arrivalAt are required");
        if (latitude.compareTo(BigDecimal.valueOf(-90)) < 0 || latitude.compareTo(BigDecimal.valueOf(90)) > 0
            || longitude.compareTo(BigDecimal.valueOf(-180)) < 0 || longitude.compareTo(BigDecimal.valueOf(180)) > 0) throw new IllegalArgumentException("coordinates are out of range");
        OffsetDateTime kstArrival = arrivalAt.withOffsetSameInstant(KST);
        KmaGridConverter.GridPoint grid = KmaGridConverter.toGrid(latitude.doubleValue(), longitude.doubleValue());
        OffsetDateTime fetchedAt = OffsetDateTime.now(clock).withOffsetSameInstant(KST);
        try {
            List<WeatherForecastSelector.ForecastPoint> latest = provider.fetch(grid.nx(), grid.ny(), fetchedAt);
            return selector.select("DESTINATION", kstArrival, grid.nx(), grid.ny(), fetchedAt, latest, List.of(), false);
        } catch (RuntimeException exception) {
            return selector.select("DESTINATION", kstArrival, grid.nx(), grid.ny(), fetchedAt, List.of(), List.of(), true);
        }
    }
}
