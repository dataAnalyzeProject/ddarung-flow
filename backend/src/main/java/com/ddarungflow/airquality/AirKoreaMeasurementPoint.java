package com.ddarungflow.airquality;

import java.time.OffsetDateTime;

public record AirKoreaMeasurementPoint(
    String stationName,
    OffsetDateTime dataTime,
    Integer pm10Value,
    Integer pm25Value,
    Double o3Value,
    String pm10Grade,
    String pm25Grade,
    String khaiGrade
) {
}
