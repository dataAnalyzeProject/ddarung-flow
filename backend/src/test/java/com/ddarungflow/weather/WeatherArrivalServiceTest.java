package com.ddarungflow.weather;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WeatherArrivalServiceTest {
    private static final ZoneOffset KST = ZoneOffset.ofHours(9);
    private static final OffsetDateTime ARRIVAL = OffsetDateTime.of(2026, 8, 15, 18, 20, 0, 0, KST);

    @Test
    void returnsNormalArrivalForecastFromProvider() {
        WeatherForecastProvider provider = (nx, ny, requestedAt) -> List.of(
            new WeatherForecastSelector.ForecastPoint(ARRIVAL.minusHours(4), OffsetDateTime.of(2026, 8, 15, 18, 0, 0, 0, KST), 25.0, 60, 1, "4")
        );
        WeatherArrivalService service = new WeatherArrivalService(provider, Clock.fixed(Instant.parse("2026-08-15T08:00:00Z"), KST));

        WeatherForecastResult result = service.getArrivalWeather(new BigDecimal("37.5665"), new BigDecimal("126.9780"), ARRIVAL);

        assertThat(result.status()).isEqualTo(WeatherStatus.NORMAL);
        assertThat(result.isRainy()).isTrue();
        assertThat(result.forecastAt()).isEqualTo(OffsetDateTime.of(2026, 8, 15, 18, 0, 0, 0, KST));
    }

    @Test
    void returnsUnavailableWhenProviderFails() {
        WeatherArrivalService service = new WeatherArrivalService((nx, ny, requestedAt) -> { throw new IllegalStateException("down"); });

        WeatherForecastResult result = service.getArrivalWeather(new BigDecimal("37.5665"), new BigDecimal("126.9780"), ARRIVAL);

        assertThat(result.status()).isEqualTo(WeatherStatus.UNAVAILABLE);
        assertThat(result.isRainy()).isFalse();
    }
}
