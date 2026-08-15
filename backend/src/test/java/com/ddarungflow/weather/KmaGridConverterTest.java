package com.ddarungflow.weather;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class KmaGridConverterTest {
    @Test
    void convertsSeoulCityHallCoordinatesToOfficialForecastGrid() {
        KmaGridConverter.GridPoint grid = KmaGridConverter.toGrid(37.5665, 126.9780);

        assertThat(grid.nx()).isEqualTo(60);
        assertThat(grid.ny()).isEqualTo(127);
    }
}
