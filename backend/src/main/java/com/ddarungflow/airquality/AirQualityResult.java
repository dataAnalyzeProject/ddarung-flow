package com.ddarungflow.airquality;

import java.time.OffsetDateTime;
import java.util.List;

public record AirQualityResult(
    String stationName,
    OffsetDateTime dataTime,
    Integer pm10Value,
    Integer pm25Value,
    Double o3Value,
    Integer khaiValue,
    String pm10GradeCode,
    String pm25GradeCode,
    String khaiGradeCode,
    AirQualityGrade pm10Grade,
    AirQualityGrade pm25Grade,
    AirQualityGrade khaiGrade,
    AirQualityStatus status,
    List<AirKoreaMeasurementPoint> recentMeasurements
) {
}
