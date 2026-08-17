package com.ddarungflow.controller;

import com.ddarungflow.weather.WeatherArrivalService;
import com.ddarungflow.weather.WeatherForecastResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/weather")
public class WeatherController {
    private final WeatherArrivalService weatherArrivalService;
    public WeatherController(WeatherArrivalService weatherArrivalService) { this.weatherArrivalService = weatherArrivalService; }

    @GetMapping("/arrival")
    public ResponseEntity<WeatherForecastResult> getArrivalWeather(
        @RequestParam BigDecimal latitude,
        @RequestParam BigDecimal longitude,
        @RequestParam OffsetDateTime arrivalAt
    ) {
        try {
            return ResponseEntity.ok(weatherArrivalService.getArrivalWeather(latitude, longitude, arrivalAt));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().build();
        }
    }
}
