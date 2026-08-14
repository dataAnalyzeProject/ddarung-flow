package com.ddarungflow.airquality;

import java.time.OffsetDateTime;

public record AirKoreaMeasurementPoint(
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
    AirQualityGrade khaiGrade
) {
}
