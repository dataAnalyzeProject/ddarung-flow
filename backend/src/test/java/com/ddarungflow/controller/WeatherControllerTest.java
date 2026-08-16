package com.ddarungflow.controller;

import com.ddarungflow.weather.WeatherArrivalService;
import com.ddarungflow.weather.WeatherForecastResult;
import com.ddarungflow.weather.WeatherStatus;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class WeatherControllerTest {
    @Test
    void returnsArrivalWeatherForValidRequest() throws Exception {
        WeatherArrivalService service = mock(WeatherArrivalService.class);
        when(service.getArrivalWeather(any(), any(), any())).thenReturn(new WeatherForecastResult(
            "DESTINATION", OffsetDateTime.of(2026, 8, 16, 12, 0, 0, 0, ZoneOffset.ofHours(9)),
            OffsetDateTime.of(2026, 8, 16, 12, 0, 0, 0, ZoneOffset.ofHours(9)), null, null,
            24.0, 0, 0, "1", false, List.of(), WeatherStatus.NORMAL
        ));
        MockMvc mockMvc = standaloneSetup(new WeatherController(service)).build();

        mockMvc.perform(get("/api/v1/weather/arrival")
                .param("latitude", "37.5665")
                .param("longitude", "126.9780")
                .param("arrivalAt", "2026-08-16T12:00:00+09:00"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NORMAL"));
    }

    @Test
    void returnsBadRequestForInvalidCoordinates() throws Exception {
        WeatherArrivalService service = mock(WeatherArrivalService.class);
        when(service.getArrivalWeather(any(), any(), any())).thenThrow(new IllegalArgumentException("coordinates are out of range"));
        MockMvc mockMvc = standaloneSetup(new WeatherController(service)).build();

        mockMvc.perform(get("/api/v1/weather/arrival")
                .param("latitude", "999")
                .param("longitude", "126.9780")
                .param("arrivalAt", "2026-08-16T12:00:00+09:00"))
            .andExpect(status().isBadRequest());
    }
}
