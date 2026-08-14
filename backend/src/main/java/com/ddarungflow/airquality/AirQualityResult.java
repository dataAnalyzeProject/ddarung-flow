package com.ddarungflow.airquality;

import java.time.OffsetDateTime;

public record AirQualityResult(
    String stationName,
    OffsetDateTime dataTime,
    AirQualityPollutant pm10,
    AirQualityPollutant pm25,
    AirQualityPollutant o3,
    AirQualityPollutant khai,
    AirQualityStatus status
) {
}
