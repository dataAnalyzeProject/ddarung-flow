package com.ddarungflow.airquality;

import java.time.OffsetDateTime;
import java.util.List;

public record AirQualityResult(
    String stationName,
    OffsetDateTime measuredAt,
    Integer pm10Value,
    Integer pm25Value,
    Double o3Value,
    String pm10Grade,
    String pm25Grade,
    String khaiGrade,
    AirQualityStatus status,
    List<AirKoreaMeasurementPoint> recentMeasurements
) {
}
